import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectionsService, ConnectionView } from "./connections.service";

// Step 3 of the migration (docs/design/P2-1-connector.md §3): with
// CONNECTIONS_READ=true, connection data is read from Connection / QuotaUsage;
// a missing row or a read error falls back to the legacy tables, and turning
// the flag off rolls back at once. Results keep the legacy shapes so callers
// barely change.

export function connectionsReadEnabled(): boolean {
  return process.env.CONNECTIONS_READ === "true";
}

export interface YoutubeConnectionConfig {
  userId: string;
  isActive: boolean;
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  tokenObtainedAt: Date | null;
  lastTokenRefreshAt: Date | null;
  tokenInvalidAt: Date | null;
  channelVideosFetchedAt: Date | null;
  updatedAt: Date;
}

export interface ZoomConnectionConfig {
  userId: string;
  isActive: boolean;
  accountId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  webhookSecretToken: string | null;
  updatedAt: Date;
}

const asDate = (value: unknown): Date | null =>
  typeof value === "string" && value ? new Date(value) : null;

// The legacy row's updatedAt the Connection was copied from (see legacy-mapping.ts)
const configUpdatedAt = (view: ConnectionView) =>
  asDate(view.state.legacyUpdatedAt) ?? view.updatedAt;

export function viewToYoutubeConfig(view: ConnectionView): YoutubeConnectionConfig {
  return {
    userId: view.userId,
    isActive: view.status === "active",
    clientId: view.settings.clientId ?? null,
    clientSecret: view.secrets.clientSecret ?? null,
    refreshToken: view.secrets.refreshToken ?? null,
    tokenObtainedAt: view.tokenObtainedAt,
    lastTokenRefreshAt: view.lastTokenRefreshAt,
    tokenInvalidAt: view.tokenInvalidAt,
    channelVideosFetchedAt: asDate(view.state.channelVideosFetchedAt),
    updatedAt: configUpdatedAt(view),
  };
}

export function viewToZoomConfig(view: ConnectionView): ZoomConnectionConfig {
  return {
    userId: view.userId,
    isActive: view.status === "active",
    accountId: view.settings.accountId ?? null,
    clientId: view.settings.clientId ?? null,
    clientSecret: view.secrets.clientSecret ?? null,
    webhookSecretToken: view.secrets.webhookSecretToken ?? null,
    updatedAt: configUpdatedAt(view),
  };
}

@Injectable()
export class ConnectionReader {
  private readonly logger = new Logger(ConnectionReader.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
  ) {}

  async youtubeConfig(userId: string): Promise<YoutubeConnectionConfig | null> {
    if (connectionsReadEnabled()) {
      const view = await this.tryRead(`youtube/${userId}`, () =>
        this.connections.find(userId, "youtube"),
      );
      if (view) return viewToYoutubeConfig(view);
    }
    return this.prisma.youtubeConfig.findUnique({ where: { userId } });
  }

  async zoomConfig(userId: string): Promise<ZoomConnectionConfig | null> {
    if (connectionsReadEnabled()) {
      const view = await this.tryRead(`zoom/${userId}`, () =>
        this.connections.find(userId, "zoom"),
      );
      if (view) return viewToZoomConfig(view);
    }
    return this.prisma.zoomConfig.findUnique({ where: { userId } });
  }

  /** Every account's Zoom config for a Zoom account id (webhook owner lookup). */
  async zoomConfigsByAccount(accountId: string): Promise<ZoomConnectionConfig[]> {
    const legacy = await this.prisma.zoomConfig.findMany({ where: { accountId } });
    if (!connectionsReadEnabled()) return legacy;
    const views = await this.tryRead(`zoom account ${accountId}`, () =>
      this.connections.findByExternalAccount("zoom", accountId),
    );
    if (!views) return legacy;
    // Legacy rows of accounts that have no Connection yet stay included
    const fromConnections = views.map(viewToZoomConfig);
    const covered = new Set(fromConnections.map((c) => c.userId));
    return [...fromConnections, ...legacy.filter((c) => !covered.has(c.userId))];
  }

  /** YouTube quota units used on a quota day. */
  async youtubeQuotaUsed(userId: string, date: string): Promise<number> {
    if (connectionsReadEnabled()) {
      const usage = await this.tryRead(`quota ${userId}/${date}`, () =>
        this.prisma.quotaUsage.findUnique({
          where: { userId_provider_date: { userId, provider: "youtube", date } },
        }),
      );
      if (usage) return usage.unitsUsed;
    }
    const legacy = await this.prisma.youtubeQuotaUsage.findUnique({
      where: { userId_date: { userId, date } },
    });
    return legacy?.unitsUsed ?? 0;
  }

  /** Units used on the most recent quota days, newest first. */
  async youtubeQuotaHistory(userId: string, days: number): Promise<number[]> {
    if (connectionsReadEnabled()) {
      const rows = await this.tryRead(`quota history ${userId}`, () =>
        this.prisma.quotaUsage.findMany({
          where: { userId, provider: "youtube" },
          orderBy: { date: "desc" },
          take: days,
          select: { unitsUsed: true },
        }),
      );
      if (rows?.length) return rows.map((r) => r.unitsUsed);
    }
    const legacy = await this.prisma.youtubeQuotaUsage.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: days,
      select: { unitsUsed: true },
    });
    return legacy.map((r) => r.unitsUsed);
  }

  // A failed read (e.g. CREDENTIALS_KEY missing or wrong) falls back to legacy
  private async tryRead<T>(what: string, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      this.logger.error(
        `Reading ${what} from Connection failed, using the legacy tables: ${error.message}`,
      );
      return null;
    }
  }
}
