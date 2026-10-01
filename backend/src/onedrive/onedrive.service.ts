import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { ConnectionsService } from "../connections/connections.service";
import { ConnectionReader } from "../connections/connection-reader.service";
import { PROVIDERS } from "../connections/providers";
import { createOAuthState, verifyOAuthState } from "../connections/oauth-state";
import { AnalyticsService } from "../analytics/analytics.service";
import axios from "axios";

const PROVIDER = "onedrive" as const;

export interface OneDriveStorage {
  total: number;
  used: number;
  remaining: number;
}

export function onedriveCallbackUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ONEDRIVE_CALLBACK_URL) return env.ONEDRIVE_CALLBACK_URL;
  const path = "/api/connections/onedrive/callback";
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${env.RAILWAY_PUBLIC_DOMAIN}${path}`;
  return `http://localhost:${env.PORT || 3001}${path}`;
}

@Injectable()
export class OneDriveService {
  private readonly logger = new Logger(OneDriveService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly connectionReader: ConnectionReader,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  private async getAppCredentials(userId: string) {
    const connection = await this.connections.find(userId, PROVIDER);
    const clientId = connection?.settings?.clientId || process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = connection?.secrets?.clientSecret || process.env.ONEDRIVE_CLIENT_SECRET;
    const tenantId = connection?.settings?.tenantId || process.env.ONEDRIVE_TENANT_ID || "common";

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        "Vui lòng cấu hình Microsoft OneDrive Client ID và Client Secret trong phần Tích hợp",
      );
    }
    return { clientId, clientSecret, tenantId };
  }

  async authUrl(userId: string): Promise<string> {
    const { clientId, tenantId } = await this.getAppCredentials(userId);
    const scope = PROVIDERS.onedrive.scopes.join(" ");
    const redirectUri = onedriveCallbackUrl();
    const state = createOAuthState({ userId, provider: PROVIDER });

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_mode=query&scope=${encodeURIComponent(scope)}&state=${state}`;
  }

  async handleCallback(code: string | undefined, state: string | undefined): Promise<string> {
    const verified = verifyOAuthState(state, PROVIDER);
    if (!verified) throw new BadRequestException("Invalid or expired authorization request");
    if (!code) throw new BadRequestException("Missing authorization code");
    const { userId } = verified;

    const { clientId, clientSecret, tenantId } = await this.getAppCredentials(userId);
    const redirectUri = onedriveCallbackUrl();

    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization-code",
        }),
      );

      const tokens = response.data;
      if (!tokens.refresh_token) {
        throw new BadRequestException("Microsoft did not return a refresh token");
      }

      // Get user info
      const meResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      await this.connections.save(userId, PROVIDER, {
        status: "active",
        externalAccountId: meResponse.data.mail || meResponse.data.userPrincipalName || null,
        externalAccountName: meResponse.data.displayName || null,
        secrets: { refreshToken: tokens.refresh_token },
      });
      await this.connections.markTokenIssued(userId, PROVIDER);
      this.analytics?.capture(userId, "connection_saved", { provider: PROVIDER, active: true });
      return userId;
    } catch (error) {
      this.logger.error(`OneDrive callback error: ${error.response?.data?.error_description || error.message}`);
      throw new BadRequestException("Failed to exchange OneDrive authorization code");
    }
  }

  async accessToken(userId: string): Promise<string | null> {
    const connection = await this.connections.find(userId, PROVIDER);
    const refreshToken = connection?.secrets.refreshToken;
    if (connection?.status !== "active" || !refreshToken) return null;

    const { clientId, clientSecret, tenantId } = await this.getAppCredentials(userId);

    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      );

      const tokens = response.data;
      if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
        await this.connections.save(userId, PROVIDER, {
          secrets: { refreshToken: tokens.refresh_token },
        });
      }

      void this.connections.markTokenRefreshed(userId, PROVIDER);
      return tokens.access_token;
    } catch (error) {
      if (error.response?.data?.error === "invalid_grant") {
        await this.connections.markTokenInvalid(userId, PROVIDER);
      }
      this.logger.warn(`OneDrive token refresh failed for ${userId}: ${error.message}`);
      return null;
    }
  }

  async storage(userId: string): Promise<OneDriveStorage | null> {
    const token = await this.accessToken(userId);
    if (!token) return null;

    try {
      const response = await axios.get("https://graph.microsoft.com/v1.0/me/drive", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const quota = response.data.quota;
      return {
        total: quota.total,
        used: quota.used,
        remaining: quota.remaining,
      };
    } catch (error) {
      this.logger.warn(`OneDrive storage info failed for ${userId}: ${error.message}`);
      return null;
    }
  }

  async disconnect(userId: string) {
    await this.connections.disconnect(userId, PROVIDER);
  }

  /**
   * Creates a folder path in OneDrive.
   * Path should be like "Zoom Recordings/Meeting Name (Date)"
   */
  async getOrCreateFolder(userId: string, path: string, rootId = "root"): Promise<string> {
    const token = await this.accessToken(userId);
    if (!token) throw new Error("OneDrive not connected");

    const segments = path.split("/").filter(Boolean);
    let parentId = rootId;

    for (const segment of segments) {
      try {
        // Try to find the folder
        const response = await axios.get(
          `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const found = response.data.value.find((f: any) => f.name === segment && f.folder);
        if (!found) throw { response: { status: 404 } };
        parentId = found.id;
      } catch (error) {
        if (error.response?.status === 404) {
          // Create the folder
          const createResponse = await axios.post(
            `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`,
            {
              name: segment,
              folder: {},
              "@microsoft.graph.conflictBehavior": "replace",
            },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          parentId = createResponse.data.id;
        } else {
          throw error;
        }
      }
    }
    return parentId;
  }

  /**
   * Creates a resumable upload session for large files.
   */
  async createUploadSession(userId: string, folderId: string, fileName: string) {
    const token = await this.accessToken(userId);
    if (!token) throw new Error("OneDrive not connected");

    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`,
      {
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
          name: fileName,
        },
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data.uploadUrl;
  }

  async listFiles(userId: string, folderId?: string) {
    const token = await this.accessToken(userId);
    if (!token) throw new BadRequestException("OneDrive not connected");

    const endpoint = folderId
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
      : `https://graph.microsoft.com/v1.0/me/drive/special/approot/children`;

    const response = await axios.get(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data.value.map((item: any) => ({
      id: item.id,
      name: item.name,
      type: item.folder ? "folder" : "file",
      mimeType: item.file?.mimeType || (item.folder ? "application/vnd.google-apps.folder" : null),
      size: item.size,
      updatedAt: item.lastModifiedDateTime,
    }));
  }

  async createFolder(userId: string, name: string, parentId?: string) {
    const token = await this.accessToken(userId);
    if (!token) throw new BadRequestException("OneDrive not connected");

    const endpoint = parentId
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`
      : `https://graph.microsoft.com/v1.0/me/drive/special/approot/children`;

    const response = await axios.post(
      endpoint,
      {
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data;
  }

  async renameItem(userId: string, itemId: string, name: string) {
    const token = await this.accessToken(userId);
    if (!token) throw new BadRequestException("OneDrive not connected");

    const response = await axios.patch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`,
      { name },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data;
  }

  async deleteItem(userId: string, itemId: string) {
    const token = await this.accessToken(userId);
    if (!token) throw new BadRequestException("OneDrive not connected");

    await axios.delete(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return { success: true };
  }
}
