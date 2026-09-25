import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectionsService } from "./connections.service";
import { CredentialsKeyError } from "./credentials-cipher";
import { youtubeConfigToSnapshot, zoomConfigToSnapshot } from "./legacy-mapping";

// Any constant shared by every instance: only one backfill runs at a time
const BACKFILL_LOCK_ID = 2_025_092_501;

export interface BackfillSummary {
  zoom: { copied: number; upToDate: number };
  youtube: { copied: number; upToDate: number };
  quota: number;
}

// Step 1–2 of the migration (docs/design/P2-1-connector.md §3): the legacy
// tables stay the source of truth, and every write to them is copied to
// Connection / QuotaUsage; a startup backfill copies what existed before.
// Never throws: the legacy write must succeed even if the copy fails.
@Injectable()
export class LegacyMirrorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyMirrorService.name);
  private missingKeyReported = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    // Not awaited: the backfill must not delay startup
    void this.backfill();
  }

  async mirrorZoom(userId: string) {
    await this.guard(`zoom/${userId}`, async () => {
      const config = await this.prisma.zoomConfig.findUnique({ where: { userId } });
      if (config) {
        await this.connections.overwrite(userId, "zoom", zoomConfigToSnapshot(config));
      }
    });
  }

  async mirrorYoutube(userId: string) {
    await this.guard(`youtube/${userId}`, async () => {
      const config = await this.prisma.youtubeConfig.findUnique({ where: { userId } });
      if (config) {
        await this.connections.overwrite(userId, "youtube", youtubeConfigToSnapshot(config));
      }
    });
  }

  /** Copies the day's YouTube quota usage (set, not increment: idempotent). */
  async mirrorYoutubeQuota(userId: string, date: string) {
    await this.guard(`quota/${userId}/${date}`, async () => {
      const usage = await this.prisma.youtubeQuotaUsage.findUnique({
        where: { userId_date: { userId, date } },
      });
      if (usage) await this.copyQuota(userId, date, usage.unitsUsed);
    });
  }

  /**
   * Copies every legacy row whose Connection is missing or older. Safe to run
   * again; runs under a Postgres advisory lock so instances do not overlap.
   */
  async backfill(): Promise<BackfillSummary | null> {
    if (!process.env.CREDENTIALS_KEY) {
      this.logger.warn(
        "Connections backfill skipped: CREDENTIALS_KEY is not set (see README)",
      );
      return null;
    }
    try {
      // The transaction only holds the lock (released when it ends); the
      // copy itself runs on the normal client
      return await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${BACKFILL_LOCK_ID}::bigint) AS locked`;
          if (!locked) {
            this.logger.log("Connections backfill already running elsewhere");
            return null;
          }
          const summary = await this.copyAll();
          this.logger.log(`Connections backfill done: ${JSON.stringify(summary)}`);
          return summary;
        },
        { maxWait: 10_000, timeout: 10 * 60_000 },
      );
    } catch (error) {
      this.logger.error(`Connections backfill failed: ${error.message}`, error.stack);
      return null;
    }
  }

  private async copyAll(): Promise<BackfillSummary> {
    const summary: BackfillSummary = {
      zoom: { copied: 0, upToDate: 0 },
      youtube: { copied: 0, upToDate: 0 },
      quota: 0,
    };
    const existing = await this.prisma.connection.findMany({
      select: { userId: true, provider: true, updatedAt: true },
    });
    const updatedAt = new Map(
      existing.map((c) => [`${c.userId}:${c.provider}`, c.updatedAt]),
    );
    // A Connection written after the legacy row is already a copy of it
    const isUpToDate = (userId: string, provider: string, legacyUpdatedAt: Date) => {
      const copied = updatedAt.get(`${userId}:${provider}`);
      return !!copied && copied >= legacyUpdatedAt;
    };

    for (const config of await this.prisma.zoomConfig.findMany()) {
      if (isUpToDate(config.userId, "zoom", config.updatedAt)) {
        summary.zoom.upToDate++;
        continue;
      }
      await this.connections.overwrite(config.userId, "zoom", zoomConfigToSnapshot(config));
      summary.zoom.copied++;
    }
    for (const config of await this.prisma.youtubeConfig.findMany()) {
      if (isUpToDate(config.userId, "youtube", config.updatedAt)) {
        summary.youtube.upToDate++;
        continue;
      }
      await this.connections.overwrite(
        config.userId,
        "youtube",
        youtubeConfigToSnapshot(config),
      );
      summary.youtube.copied++;
    }
    for (const usage of await this.prisma.youtubeQuotaUsage.findMany()) {
      await this.copyQuota(usage.userId, usage.date, usage.unitsUsed);
      summary.quota++;
    }
    return summary;
  }

  private copyQuota(userId: string, date: string, unitsUsed: number) {
    return this.prisma.quotaUsage.upsert({
      where: { userId_provider_date: { userId, provider: "youtube", date } },
      update: { unitsUsed },
      create: { userId, provider: "youtube", date, unitsUsed },
    });
  }

  private async guard(what: string, copy: () => Promise<void>) {
    try {
      await copy();
    } catch (error) {
      if (error instanceof CredentialsKeyError) {
        // Once per process: every legacy write would repeat it
        if (!this.missingKeyReported) {
          this.missingKeyReported = true;
          this.logger.warn(`Connections not mirrored: ${error.message}`);
        }
        return;
      }
      this.logger.error(`Failed to mirror ${what} to Connection: ${error.message}`);
    }
  }
}
