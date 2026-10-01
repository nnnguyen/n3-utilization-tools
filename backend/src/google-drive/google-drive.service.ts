import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { google } from "googleapis";
import { ConnectionsService } from "../connections/connections.service";
import { ConnectionReader } from "../connections/connection-reader.service";
import { PROVIDERS } from "../connections/providers";
import { createOAuthState, verifyOAuthState } from "../connections/oauth-state";
import { AnalyticsService } from "../analytics/analytics.service";

const PROVIDER = "google_drive" as const;

export interface DriveStorage {
  // null: unlimited (some Google Workspace plans)
  limit: number | null;
  usage: number;
}

/** Where Google sends the user back: this backend, not the frontend. */
export function driveCallbackUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GOOGLE_DRIVE_CALLBACK_URL) return env.GOOGLE_DRIVE_CALLBACK_URL;
  const path = "/api/connections/google_drive/callback";
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${env.RAILWAY_PUBLIC_DOMAIN}${path}`;
  return `http://localhost:${env.PORT || 3001}${path}`;
}

// Google Drive connection (P2-3a, docs/design/P2-3-google-drive.md): its own
// Google account and refresh token, with the account's YouTube OAuth client
// (the same Google Cloud project; the redirect URI above must be added to it).
@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly connectionReader: ConnectionReader,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  private async oauthClient(userId: string) {
    const youtube = await this.connectionReader.youtubeConfig(userId);
    const clientId = youtube?.clientId || process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = youtube?.clientSecret || process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        "Hãy lưu Client ID và Client Secret của Google trong thẻ YouTube trước — Google Drive dùng chung ứng dụng Google đó",
      );
    }
    return new google.auth.OAuth2(clientId, clientSecret, driveCallbackUrl());
  }

  async authUrl(userId: string): Promise<string> {
    const client = await this.oauthClient(userId);
    return client.generateAuthUrl({
      access_type: "offline",
      // A refresh token every time, also when access was granted before
      prompt: "consent",
      scope: [...PROVIDERS.google_drive.scopes],
      state: createOAuthState({ userId, provider: PROVIDER }),
    });
  }

  /** Google's redirect: stores the refresh token and the Drive account. Returns the user id. */
  async handleCallback(code: string | undefined, state: string | undefined): Promise<string> {
    const verified = verifyOAuthState(state, PROVIDER);
    if (!verified) throw new BadRequestException("Invalid or expired authorization request");
    if (!code) throw new BadRequestException("Missing authorization code");
    const { userId } = verified;

    const client = await this.oauthClient(userId);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException("Google did not return a refresh token");
    }
    client.setCredentials(tokens);
    const about = await google.drive({ version: "v3", auth: client }).about.get({
      fields: "user(emailAddress,displayName)",
    });

    await this.connections.save(userId, PROVIDER, {
      status: "active",
      externalAccountId: about.data.user?.emailAddress ?? null,
      externalAccountName: about.data.user?.displayName ?? null,
      secrets: { refreshToken: tokens.refresh_token },
    });
    await this.connections.markTokenIssued(userId, PROVIDER);
    this.analytics?.capture(userId, "connection_saved", { provider: PROVIDER, active: true });
    return userId;
  }

  /** An authorized Drive client, or null when not connected. */
  async drive(userId: string) {
    const connection = await this.connections.find(userId, PROVIDER);
    const refreshToken = connection?.secrets.refreshToken;
    if (connection?.status !== "active" || !refreshToken) return null;
    const client = await this.oauthClient(userId);
    client.setCredentials({ refresh_token: refreshToken });
    // Emitted when the refresh token is exchanged, i.e. still valid
    client.on("tokens", () => void this.connections.markTokenRefreshed(userId, PROVIDER));
    return google.drive({ version: "v3", auth: client });
  }

  /** A fresh access token for raw Drive requests (resumable uploads), or null when not connected. */
  async accessToken(userId: string): Promise<string | null> {
    const connection = await this.connections.find(userId, PROVIDER);
    const refreshToken = connection?.secrets.refreshToken;
    if (connection?.status !== "active" || !refreshToken) return null;
    const client = await this.oauthClient(userId);
    client.setCredentials({ refresh_token: refreshToken });
    const { token } = await client.getAccessToken();
    void this.connections.markTokenRefreshed(userId, PROVIDER);
    return token ?? null;
  }

  async isConnected(userId: string): Promise<boolean> {
    const connection = await this.connections.find(userId, PROVIDER);
    return connection?.status === "active" && !!connection.secrets.refreshToken && !connection.tokenInvalidAt;
  }

  /** Google refused the refresh token: the card asks to authorize again. */
  async markTokenInvalid(userId: string) {
    await this.connections.markTokenInvalid(userId, PROVIDER);
  }

  /** Space of the connected Drive, or null (not connected, or Google refused). Never throws. */
  async storage(userId: string): Promise<DriveStorage | null> {
    try {
      const drive = await this.drive(userId);
      if (!drive) return null;
      const about = await drive.about.get({ fields: "storageQuota(limit,usage)" });
      const quota = about.data.storageQuota;
      return {
        limit: quota?.limit ? Number(quota.limit) : null,
        usage: Number(quota?.usage ?? 0),
      };
    } catch (error) {
      // The refresh token was revoked or expired (not e.g. a wrong client: invalid_client)
      if (error?.response?.data?.error === "invalid_grant" || String(error?.message ?? "").includes("invalid_grant")) {
        await this.connections.markTokenInvalid(userId, PROVIDER);
      }
      this.logger.warn(`Drive storage of ${userId} unavailable: ${error.message}`);
      return null;
    }
  }

  async disconnect(userId: string) {
    await this.connections.disconnect(userId, PROVIDER);
  }

  async listFiles(userId: string, folderId?: string) {
    const drive = await this.drive(userId);
    if (!drive) throw new BadRequestException("Google Drive not connected");

    const response = await drive.files.list({
      q: `'${folderId || "root"}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, size, modifiedTime)",
      orderBy: "folder,name",
    });

    return response.data.files?.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size) : null,
      updatedAt: f.modifiedTime,
    }));
  }

  async createFolder(userId: string, name: string, parentId?: string) {
    const drive = await this.drive(userId);
    if (!drive) throw new BadRequestException("Google Drive not connected");

    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      },
      fields: "id, name",
    });

    return response.data;
  }

  async renameItem(userId: string, itemId: string, name: string) {
    const drive = await this.drive(userId);
    if (!drive) throw new BadRequestException("Google Drive not connected");

    const response = await drive.files.update({
      fileId: itemId,
      requestBody: { name },
      fields: "id, name",
    });

    return response.data;
  }

  async deleteItem(userId: string, itemId: string) {
    const drive = await this.drive(userId);
    if (!drive) throw new BadRequestException("Google Drive not connected");

    await drive.files.update({
      fileId: itemId,
      requestBody: { trashed: true },
    });

    return { success: true };
  }
}
