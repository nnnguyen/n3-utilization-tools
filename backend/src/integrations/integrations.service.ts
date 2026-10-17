import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectionReader } from "../connections/connection-reader.service";
import { ActivityService } from "../activity/activity.service";
import {
  isProviderId,
  PROVIDERS,
  ProviderDefinition,
  ProviderId,
} from "../connections/providers";
import { quotaDate, tokenHealth } from "../connections/token-health";
import { connectionCard, ConnectionCard } from "./connection-card";
import { ConnectionView, ConnectionsService } from "../connections/connections.service";
import { GoogleDriveService } from "../google-drive/google-drive.service";
import { OneDriveService } from "../onedrive/onedrive.service";
import { UpdateConnectionDto } from "./dto/update-connection.dto";
import {
  UpdateZoomConfigDto,
  UpdateYoutubeConfigDto,
} from "./dto/update-config.dto";
import {
  stripEmptySecrets,
  toPublicConfig,
  toPublicYoutubeConfig,
  toPublicZoomConfig,
  YOUTUBE_SECRET_FIELDS,
  ZOOM_SECRET_FIELDS,
} from "./public-config";
import {
  viewToYoutubeConfig,
  viewToZoomConfig,
} from "../connections/connection-reader.service";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionReader: ConnectionReader,
    private readonly connections: ConnectionsService,
    private readonly googleDrive: GoogleDriveService,
    private readonly oneDrive: OneDriveService,
    private readonly activity: ActivityService,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  async getConfigs(userId: string) {
    const [zoomConfig, youtubeConfig] = await Promise.all([
      this.connectionReader.zoomConfig(userId),
      this.connectionReader.youtubeConfig(userId),
    ]);

    return toPublicConfig(zoomConfig, youtubeConfig);
  }

  async updateZoomConfig(userId: string, dto: UpdateZoomConfigDto, workspaceId?: string, connectionId?: string) {
    const data = stripEmptySecrets(dto, ZOOM_SECRET_FIELDS);
    const { isActive, ...others } = data;
    const secrets: Record<string, string> = {};
    const settings: Record<string, string> = {};

    for (const [key, value] of Object.entries(others)) {
      if (typeof value === "string") {
        if (ZOOM_SECRET_FIELDS.includes(key as any)) secrets[key] = value;
        else settings[key] = value;
      }
    }

    const view = await this.connections.save(userId, "zoom", {
      status: isActive === false ? "disabled" : "active",
      workspaceId,
      settings,
      secrets,
      externalAccountId: settings.accountId,
    }, connectionId);

    await this.activity.record({
      actorId: userId,
      workspaceId: view.workspaceId,
      action: view.status === "active" ? "connection.enabled" : "connection.disabled",
      data: { provider: "zoom", ...settings },
    });

    this.analytics?.capture(userId, "connection_saved", {
      provider: "zoom",
      active: view.status === "active",
    });
    return toPublicZoomConfig(viewToZoomConfig(view));
  }

  async updateYoutubeConfig(userId: string, dto: UpdateYoutubeConfigDto, workspaceId?: string, connectionId?: string) {
    const data = stripEmptySecrets(dto, YOUTUBE_SECRET_FIELDS);
    const { isActive, ...others } = data;
    const secrets: Record<string, string> = {};
    const settings: Record<string, string> = {};

    for (const [key, value] of Object.entries(others)) {
      if (typeof value === "string") {
        if (YOUTUBE_SECRET_FIELDS.includes(key as any)) secrets[key] = value;
        else settings[key] = value;
      }
    }

    const view = await this.connections.save(userId, "youtube", {
      status: isActive === false ? "disabled" : "active",
      workspaceId,
      settings,
      secrets,
    }, connectionId);

    await this.activity.record({
      actorId: userId,
      workspaceId: view.workspaceId,
      action: view.status === "active" ? "connection.enabled" : "connection.disabled",
      data: { provider: "youtube", ...settings },
    });

    this.analytics?.capture(userId, "connection_saved", {
      provider: "youtube",
      active: view.status === "active",
    });
    return toPublicYoutubeConfig(viewToYoutubeConfig(view));
  }

  // --- /connections (P2-1d): one card per app. Writes still go to the
  // legacy tables (the source of truth) and are mirrored to Connection.

  async listConnections(userId: string): Promise<ConnectionCard[]> {
    const connections = await this.prisma.connection.findMany({
      where: { userId },
    });

    const cards: ConnectionCard[] = [];
    const connectedProviders = new Set<string>();

    for (const connection of connections) {
      const provider = this.provider(connection.provider);
      cards.push(await this.connectionCardOf(userId, provider, connection.id));
      connectedProviders.add(connection.provider);
    }

    // Add "not_configured" cards for providers that haven't been connected yet.
    // For singletons (Drive, OneDrive), we always want a card.
    for (const provider of Object.values(PROVIDERS)) {
      if (provider.id === "zoom" || provider.id === "youtube") {
        if (!connectedProviders.has(provider.id)) {
          cards.push(await this.connectionCardOf(userId, provider));
        }
        continue;
      }

      if (!connectedProviders.has(provider.id)) {
        cards.push(await this.connectionCardOf(userId, provider));
      }
    }

    return cards;
  }

  async getConnection(userId: string, providerId: string) {
    return this.connectionCardOf(userId, this.provider(providerId));
  }

  async updateConnection(userId: string, providerId: string, dto: UpdateConnectionDto) {
    const provider = this.provider(providerId);
    // Nothing to type in: connected only by authorizing with Google
    if (provider.id === "google_drive") {
      throw new BadRequestException("Google Drive is connected by authorizing with Google");
    }
    const fields: Record<string, string | boolean> = {};
    if (dto.isActive !== undefined) fields.isActive = dto.isActive;
    for (const [group, allowed, values] of [
      ["setting", provider.settingsFields, dto.settings],
      ["secret", provider.secretFields, dto.secrets],
    ] as const) {
      for (const [field, value] of Object.entries(values ?? {})) {
        if (!allowed.includes(field)) {
          throw new BadRequestException(`Unknown ${provider.id} ${group}: ${field}`);
        }
        if (value !== null && typeof value !== "string") {
          throw new BadRequestException(`${field} must be a string`);
        }
        fields[field] = value ?? "";
      }
    }
    if (provider.id === "zoom") await this.updateZoomConfig(userId, fields, dto.workspaceId, dto.id);
    else await this.updateYoutubeConfig(userId, fields, dto.workspaceId, dto.id);
    return this.connectionCardOf(userId, provider);
  }

  /** Turns the connection off and forgets its token (sync history is kept). */
  async disconnect(userId: string, providerId: string, connectionId?: string) {
    const provider = this.provider(providerId);
    let workspaceId: string | null = null;

    if (provider.id === "google_drive") {
      // Files already backed up stay in the Drive
      const view = connectionId 
        ? await this.prisma.connection.findUnique({ where: { id: connectionId } }).then(row => row ? (this.connections as any).toView(row) : null)
        : await this.connections.find(userId, "google_drive");
      workspaceId = view?.workspaceId ?? null;
      await this.googleDrive.disconnect(userId);
    } else if (provider.id === "onedrive") {
      const view = connectionId
        ? await this.prisma.connection.findUnique({ where: { id: connectionId } }).then(row => row ? (this.connections as any).toView(row) : null)
        : await this.connections.find(userId, "onedrive");
      workspaceId = view?.workspaceId ?? null;
      await this.oneDrive.disconnect(userId);
    } else if (provider.id === "zoom") {
      const view = await this.connections.save(userId, "zoom", {
        status: "disabled",
        secrets: { clientSecret: "", webhookSecretToken: "" },
      }, connectionId);
      workspaceId = view.workspaceId;
    } else {
      // The OAuth app (client id/secret) stays, so reconnecting is one click
      const view = await this.connections.save(userId, "youtube", {
        status: "disabled",
        secrets: { refreshToken: "" },
      }, connectionId);
      workspaceId = view.workspaceId;
      await this.connections.markTokenInvalid(userId, "youtube");
    }

    await this.activity.record({
      actorId: userId,
      workspaceId,
      action: "connection.disconnected",
      data: { provider: provider.id },
    });

    this.analytics?.capture(userId, "connection_disconnected", { provider: provider.id });
    return this.connectionCardOf(userId, provider);
  }

  async deleteConnection(userId: string, providerId: string, connectionId?: string) {
    const provider = this.provider(providerId);
    let workspaceId: string | null = null;

    const row = connectionId
      ? await this.prisma.connection.findUnique({ where: { id: connectionId } })
      : await this.prisma.connection.findFirst({ where: { userId, provider: providerId as any } });

    if (!row) throw new NotFoundException(`Connection not found`);
    workspaceId = (row as any).workspaceId ?? null;

    await this.connections.delete(userId, provider.id as any, connectionId);

    await this.activity.record({
      actorId: userId,
      workspaceId,
      action: "connection.deleted",
      data: { provider: provider.id },
    });

    this.analytics?.capture(userId, "connection_deleted", { provider: provider.id });
  }

  private provider(id: string): ProviderDefinition {
    if (!isProviderId(id)) throw new NotFoundException(`Unknown app: ${id}`);
    return PROVIDERS[id as ProviderId];
  }

  private async connectionCardOf(
    userId: string,
    provider: ProviderDefinition,
    connectionId?: string,
  ): Promise<ConnectionCard> {
    if (provider.id === "google_drive") return this.driveCard(userId, provider, connectionId);
    if (provider.id === "onedrive") return this.onedriveCard(userId, provider, connectionId);

    let view: ConnectionView | null = null;
    if (connectionId) {
      const row = await this.prisma.connection.findUnique({ where: { id: connectionId } });
      view = row ? (this.connections as any).toView(row) : null;
    } else {
      view = await this.connections.find(userId, provider.id as any);
    }

    const fields = view
      ? {
          isActive: view.status === "active",
          id: view.id,
          workspaceId: view.workspaceId,
          ...view.settings,
          ...view.secrets,
          tokenObtainedAt: view.tokenObtainedAt,
          lastTokenRefreshAt: view.lastTokenRefreshAt,
          tokenInvalidAt: view.tokenInvalidAt,
        }
      : null;

    const health = tokenHealth(
      {
        active: !!fields?.isActive,
        hasToken: !!fields?.[provider.connectedWhen],
        tokenObtainedAt: fields?.tokenObtainedAt ?? null,
        lastTokenRefreshAt: fields?.lastTokenRefreshAt ?? null,
        tokenInvalidAt: fields?.tokenInvalidAt ?? null,
      },
      provider.tokenPolicy,
    );
    let quota: ConnectionCard["quota"] = null;
    if (provider.quota) {
      const date = quotaDate(new Date(), provider.quota.resetTimeZone);
      const quotaLimit = provider.quota.dailyLimit();
      const unitsUsed = await this.connectionReader.youtubeQuotaUsed(userId, date);
      quota = {
        unitsUsed,
        unitsRemaining: Math.max(0, quotaLimit - unitsUsed),
        quotaLimit,
        date,
      };
    }
    return connectionCard(provider, fields, health, quota);
  }

  // Google Drive lives only in Connection (no legacy table)
  private async driveCard(
    userId: string,
    provider: ProviderDefinition,
    connectionId?: string,
  ): Promise<ConnectionCard> {
    const view = connectionId
      ? await this.prisma.connection
          .findUnique({ where: { id: connectionId } })
          .then((row) => (row ? (this.connections as any).toView(row) : null))
      : await this.connections.find(userId, "google_drive");

    const fields = view
      ? { isActive: view.status === "active", id: view.id, workspaceId: view.workspaceId, ...view.settings, ...view.secrets }
      : null;
    const health = tokenHealth(
      {
        active: view?.status === "active",
        hasToken: !!view?.secrets.refreshToken,
        tokenObtainedAt: view?.tokenObtainedAt ?? null,
        lastTokenRefreshAt: view?.lastTokenRefreshAt ?? null,
        tokenInvalidAt: view?.tokenInvalidAt ?? null,
      },
      provider.tokenPolicy,
    );
    const card = connectionCard(provider, fields, health, null);
    return {
      ...card,
      externalAccountId: view?.externalAccountId ?? null,
      externalAccountName: view?.externalAccountName ?? null,
      storage: card.connected && !health.tokenInvalid ? await this.googleDrive.storage(userId) : null,
    };
  }

  private async onedriveCard(
    userId: string,
    provider: ProviderDefinition,
    connectionId?: string,
  ): Promise<ConnectionCard> {
    const view = connectionId
      ? await this.prisma.connection
          .findUnique({ where: { id: connectionId } })
          .then((row) => (row ? (this.connections as any).toView(row) : null))
      : await this.connections.find(userId, "onedrive");

    const fields = view
      ? { isActive: view.status === "active", id: view.id, workspaceId: view.workspaceId, ...view.settings, ...view.secrets }
      : null;
    const health = tokenHealth(
      {
        active: view?.status === "active",
        hasToken: !!view?.secrets.refreshToken,
        tokenObtainedAt: view?.tokenObtainedAt ?? null,
        lastTokenRefreshAt: view?.lastTokenRefreshAt ?? null,
        tokenInvalidAt: view?.tokenInvalidAt ?? null,
      },
      provider.tokenPolicy,
    );
    const card = connectionCard(provider, fields, health, null);
    const storage = card.connected && !health.tokenInvalid ? await this.oneDrive.storage(userId) : null;
    return {
      ...card,
      externalAccountId: view?.externalAccountId ?? null,
      externalAccountName: view?.externalAccountName ?? null,
      storage: storage ? { usage: storage.used, limit: storage.total } : null,
    };
  }

  async listFiles(userId: string, provider: string, folderId?: string) {
    if (provider === "google_drive") return this.googleDrive.listFiles(userId, folderId);
    if (provider === "onedrive") return this.oneDrive.listFiles(userId, folderId);
    throw new BadRequestException(`Listing files not supported for ${provider}`);
  }

  async createFolder(userId: string, provider: string, name: string, parentId?: string) {
    if (provider === "google_drive") return this.googleDrive.createFolder(userId, name, parentId);
    if (provider === "onedrive") return this.oneDrive.createFolder(userId, name, parentId);
    throw new BadRequestException(`Creating folders not supported for ${provider}`);
  }

  async renameFile(userId: string, provider: string, fileId: string, name: string) {
    if (provider === "google_drive") return this.googleDrive.renameItem(userId, fileId, name);
    if (provider === "onedrive") return this.oneDrive.renameItem(userId, fileId, name);
    throw new BadRequestException(`Renaming items not supported for ${provider}`);
  }

  async deleteFile(userId: string, provider: string, fileId: string) {
    if (provider === "google_drive") return this.googleDrive.deleteItem(userId, fileId);
    if (provider === "onedrive") return this.oneDrive.deleteItem(userId, fileId);
    throw new BadRequestException(`Deleting items not supported for ${provider}`);
  }
}
