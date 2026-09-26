import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SYNC_ERROR_TEXT } from "../notifications/notification-text";
import {
  YoutubeService,
  MAX_AUTO_RETRIES,
} from "../youtube/youtube.service";
import { ZoomService } from "./zoom.service";
import { CaptionService } from "./caption.service";

const TICK_MS = 30_000;
// Processing checks cost quota, so they run less often than the retry check
const PROCESSING_CHECK_EVERY_TICKS = 4; // every 2 minutes
// Caption retries (transcripts that arrive late, temporary failures)
const CAPTION_SWEEP_EVERY_TICKS = 10; // every 5 minutes
// Videos still PROCESSING after this long are left to the manual refresh
const PROCESSING_CHECK_WINDOW_MS = 24 * 60 * 60_000;

// Simple in-process scheduler (no queue in this project). All state lives in
// ZoomSyncLog (nextRetryAt / autoRetryCount), so a restart loses nothing:
// due retries are picked up on the next tick.
@Injectable()
export class ZoomSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZoomSyncSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private tickCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    private readonly zoomService: ZoomService,
    private readonly captionService: CaptionService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.SYNC_SCHEDULER_ENABLED === "false"
    ) {
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runDueRetries();
      if (this.tickCount % PROCESSING_CHECK_EVERY_TICKS === 0) {
        await this.checkProcessingVideos();
      }
      if (this.tickCount % CAPTION_SWEEP_EVERY_TICKS === 0) {
        await this.captionService.sweep();
      }
    } catch (error) {
      this.logger.error("Sync scheduler tick failed", error.stack);
    } finally {
      this.tickCount++;
      this.running = false;
    }
  }

  private async runDueRetries() {
    const due = await this.prisma.zoomSyncLog.findMany({
      where: { syncStatus: "FAILED", nextRetryAt: { lte: new Date() } },
      take: 5,
    });

    for (const log of due) {
      if (!log.recordingId) continue;
      const attempt = log.autoRetryCount + 1;
      const claimedAt = new Date();

      // Claim the retry atomically so it cannot run twice (e.g. a manual
      // re-sync clearing nextRetryAt in between)
      const { count } = await this.prisma.zoomSyncLog.updateMany({
        where: { id: log.id, syncStatus: "FAILED", nextRetryAt: log.nextRetryAt },
        data: { nextRetryAt: null, autoRetryCount: attempt },
      });
      if (count === 0) continue;

      if (!(await this.youtubeService.hasQuotaForUpload(log.userId))) {
        this.logger.warn(
          `Skipping auto-retry ${attempt} for ${log.recordingId}: not enough quota`,
        );
        await this.youtubeService.notifySyncFailed(
          log.userId,
          log.recordingId,
          log.meeting,
          SYNC_ERROR_TEXT.retryQuotaExhausted.vi,
          log.autoRetryCount,
          "retryQuotaExhausted",
        );
        continue;
      }

      this.logger.log(`Running auto-retry ${attempt} for ${log.recordingId}`);
      // Not awaited: an upload can take many minutes and must not block the tick
      this.zoomService
        .syncRecording(
          log.userId,
          log.recordingId,
          log.meeting,
          log.recordingStartTime || "",
          (log.privacyStatus as "public" | "private" | "unlisted") || "private",
          log.playlistId || undefined,
          attempt,
          log.publishAt,
        )
        .catch((error) =>
          this.handleRetryError(log.recordingId!, claimedAt, error),
        );
    }
  }

  // syncRecording rethrows errors that processRecordingSync already recorded.
  // Only an error raised before that point (fetching the recording from Zoom)
  // still needs to be recorded and possibly rescheduled here.
  private async handleRetryError(
    recordingId: string,
    claimedAt: Date,
    error: any,
  ) {
    try {
      const log = await this.prisma.zoomSyncLog.findUnique({
        where: { recordingId },
      });
      if (!log) return;
      const syncStartedAgain =
        log.syncStartedAt && log.syncStartedAt >= claimedAt;
      if (syncStartedAgain) return;

      await this.prisma.zoomSyncLog.update({
        where: { recordingId },
        data: {
          event: `Tự động retry lần ${log.autoRetryCount}/${MAX_AUTO_RETRIES}`,
          attemptCount: { increment: 1 },
          syncError: error.message,
          errorMessage: error.message,
          errorSource: "upload",
        },
      });
      await this.youtubeService.handleSyncFailure(recordingId, error);
    } catch (e) {
      this.logger.error(
        `Failed to record auto-retry error for ${recordingId}`,
        e.stack,
      );
    }
  }

  private async checkProcessingVideos() {
    const logs = await this.prisma.zoomSyncLog.findMany({
      where: {
        syncStatus: "PROCESSING",
        youtubeVideoId: { not: null },
        syncStartedAt: { gte: new Date(Date.now() - PROCESSING_CHECK_WINDOW_MS) },
      },
      take: 20,
    });

    for (const log of logs) {
      try {
        await this.youtubeService.checkVideoProcessingStatus(
          log.youtubeVideoId!,
          log.recordingId || undefined,
          log.userId,
        );
      } catch (error) {
        this.logger.warn(
          `Background processing check failed for ${log.recordingId}: ${error.message}`,
        );
      }
    }
  }
}
