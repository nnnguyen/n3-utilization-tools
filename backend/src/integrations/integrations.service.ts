import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import { LegacyMirrorService } from "../connections/legacy-mirror.service";
import { ConnectionReader } from "../connections/connection-reader.service";
import {
  isProviderId,
  PROVIDERS,
  ProviderDefinition,
  ProviderId,
} from "../connections/providers";
import { quotaDate, tokenHealth } from "../connections/token-health";
import { connectionCard, ConnectionCard } from "./connection-card";
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

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legacyMirror: LegacyMirrorService,
    private readonly connectionReader: ConnectionReader,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  async getConfigs(userId: string) {
    const [zoomConfig, youtubeConfig] = await Promise.all([
      this.connectionReader.zoomConfig(userId),
      this.connectionReader.youtubeConfig(userId),
    ]);

    return toPublicConfig(zoomConfig, youtubeConfig);
  }

  async updateZoomConfig(userId: string, dto: UpdateZoomConfigDto) {
    const data = stripEmptySecrets(dto, ZOOM_SECRET_FIELDS);
    const config = await this.prisma.zoomConfig.upsert({
      where: { userId },
      update: data,
      create: {
        ...data,
        userId,
      },
    });
    await this.legacyMirror.mirrorZoom(userId);
    this.analytics?.capture(userId, "connection_saved", { provider: "zoom", active: config.isActive });
    return toPublicZoomConfig(config);
  }

  async updateYoutubeConfig(userId: string, dto: UpdateYoutubeConfigDto) {
    const data = stripEmptySecrets(dto, YOUTUBE_SECRET_FIELDS);
    const config = await this.prisma.youtubeConfig.upsert({
      where: { userId },
      update: data,
      create: {
        ...data,
        userId,
      },
    });
    await this.legacyMirror.mirrorYoutube(userId);
    this.analytics?.capture(userId, "connection_saved", { provider: "youtube", active: config.isActive });
    return toPublicYoutubeConfig(config);
  }

  // --- /connections (P2-1d): one card per app. Writes still go to the
  // legacy tables (the source of truth) and are mirrored to Connection.

  async listConnections(userId: string): Promise<ConnectionCard[]> {
    return Promise.all(
      Object.values(PROVIDERS).map((provider) => this.connectionCardOf(userId, provider)),
    );
  }

  async getConnection(userId: string, providerId: string) {
    return this.connectionCardOf(userId, this.provider(providerId));
  }

  async updateConnection(userId: string, providerId: string, dto: UpdateConnectionDto) {
    const provider = this.provider(providerId);
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
    if (provider.id === "zoom") await this.updateZoomConfig(userId, fields);
    else await this.updateYoutubeConfig(userId, fields);
    return this.connectionCardOf(userId, provider);
  }

  /** Turns the connection off and forgets its token (sync history is kept). */
  async disconnect(userId: string, providerId: string) {
    const provider = this.provider(providerId);
    if (provider.id === "zoom") {
      await this.prisma.zoomConfig.updateMany({
        where: { userId },
        data: { isActive: false, clientSecret: null, webhookSecretToken: null },
      });
      await this.legacyMirror.mirrorZoom(userId);
    } else {
      // The OAuth app (client id/secret) stays, so reconnecting is one click
      await this.prisma.youtubeConfig.updateMany({
        where: { userId },
        data: {
          isActive: false,
          refreshToken: null,
          tokenObtainedAt: null,
          lastTokenRefreshAt: null,
          tokenInvalidAt: null,
        },
      });
      await this.legacyMirror.mirrorYoutube(userId);
    }
    this.analytics?.capture(userId, "connection_disconnected", { provider: provider.id });
    return this.connectionCardOf(userId, provider);
  }

  private provider(id: string): ProviderDefinition {
    if (!isProviderId(id)) throw new NotFoundException(`Unknown app: ${id}`);
    return PROVIDERS[id as ProviderId];
  }

  private async connectionCardOf(
    userId: string,
    provider: ProviderDefinition,
  ): Promise<ConnectionCard> {
    const config =
      provider.id === "zoom"
        ? await this.connectionReader.zoomConfig(userId)
        : await this.connectionReader.youtubeConfig(userId);
    const fields = (config ?? null) as ({ isActive: boolean } & Record<string, unknown>) | null;
    const health = tokenHealth(
      {
        active: !!config?.isActive,
        hasToken: !!fields?.[provider.connectedWhen],
        tokenObtainedAt: (fields?.tokenObtainedAt as Date | null) ?? null,
        lastTokenRefreshAt: (fields?.lastTokenRefreshAt as Date | null) ?? null,
        tokenInvalidAt: (fields?.tokenInvalidAt as Date | null) ?? null,
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
}
