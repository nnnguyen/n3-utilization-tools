import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { codedError } from "../common/coded-error";
import { PrismaService } from "../prisma/prisma.service";
import { SYNC_ERROR_TEXT } from "../notifications/notification-text";
import { YoutubeService } from "../youtube/youtube.service";
import { ZoomService } from "./zoom.service";
import {
  CAPTION_WAIT_MS,
  CaptionStatus,
  captionSweepDecision,
  captionTrackName,
  pickTranscriptFile,
} from "./captions";

// Caption uploads per scheduler sweep (each may cost up to 500 quota units)
const SWEEP_UPLOAD_LIMIT = 5;

export interface CaptionResult {
  status: CaptionStatus | "skipped";
  reason?: string;
}

// Captions from the Zoom transcript (docs/design/P2-5-captions.md): once a
// sync is COMPLETED, the transcript of the recording becomes a caption track
// of its YouTube video. Only captionStatus & co. change, never syncStatus.
@Injectable()
export class CaptionService implements OnModuleInit {
  private readonly logger = new Logger(CaptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zoomService: ZoomService,
    private readonly youtubeService: YoutubeService,
  ) {}

  onModuleInit() {
    this.youtubeService.onSyncCompleted((recordingId) => this.onSyncCompleted(recordingId));
  }

  private async onSyncCompleted(recordingId: string) {
    await this.tryUpload(recordingId);
  }

  /**
   * Zoom finished the transcript (webhook recording.transcript_completed).
   * A recording already in the caption workflow (captions on, or asked by
   * hand) continues even if captions were switched off since.
   */
  async onTranscriptReady(recordingId: string): Promise<CaptionResult> {
    const log = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
      select: { captionStatus: true },
    });
    return this.tryUpload(recordingId, { manual: !!log?.captionStatus });
  }

  /**
   * Scheduler fallback: retries recordings waiting for a transcript (missed
   * webhook), interrupted uploads and temporary failures; gives up after 48 h.
   */
  async sweep(now = new Date()) {
    const candidates = await this.prisma.zoomSyncLog.findMany({
      where: {
        captionStatus: { in: ["waiting_transcript", "pending", "failed"] },
        captionUpdatedAt: { gte: new Date(now.getTime() - 2 * CAPTION_WAIT_MS) },
      },
      orderBy: { captionUpdatedAt: "asc" },
      take: 50,
      select: {
        recordingId: true,
        captionStatus: true,
        captionErrorCode: true,
        captionAttempts: true,
        captionUpdatedAt: true,
        syncCompletedAt: true,
      },
    });
    let uploads = 0;
    for (const log of candidates) {
      if (!log.recordingId) continue;
      const decision = captionSweepDecision(log, now);
      if (decision === "give_up") {
        await this.setStatus(log.recordingId, "no_transcript");
        this.logger.log(`No transcript for recording ${log.recordingId} after 48 hours`);
      } else if (decision === "retry" && uploads < SWEEP_UPLOAD_LIMIT) {
        uploads++;
        // Already in the caption workflow: continue regardless of the switch
        await this.tryUpload(log.recordingId, { manual: true });
      }
    }
  }

  /**
   * "Upload captions" on one recording (POST /zoom/recordings/:id/captions):
   * works with captions off and for videos synced before this feature, and
   * gives the automatic retries a fresh start.
   */
  async uploadForUser(userId: string, recordingId: string) {
    const log = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
      select: { userId: true, syncStatus: true, youtubeVideoId: true },
    });
    if (!log || log.userId !== userId) {
      throw codedError(NotFoundException, "CAPTION_RECORDING_NOT_FOUND", "Không tìm thấy recording đã sync");
    }
    if (log.syncStatus !== "COMPLETED" || !log.youtubeVideoId) {
      throw codedError(
        BadRequestException,
        "CAPTION_VIDEO_NOT_READY",
        "Video chưa có trên YouTube — hãy đợi sync xong rồi tải phụ đề",
      );
    }
    await this.prisma.zoomSyncLog.update({
      where: { recordingId },
      data: { captionAttempts: 0 },
    });
    const result = await this.tryUpload(recordingId, { manual: true });
    // The stored outcome, for the UI to show without reloading every log
    const caption = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
      select: { captionStatus: true, captionErrorCode: true, captionError: true, captionUpdatedAt: true },
    });
    return { ...result, ...caption };
  }

  /**
   * Uploads the recording's transcript as captions when possible.
   * `manual`: asked by the user ("Upload captions"), even with captions off.
   * Never throws.
   */
  async tryUpload(recordingId: string, options: { manual?: boolean } = {}): Promise<CaptionResult> {
    try {
      const log = await this.prisma.zoomSyncLog.findUnique({ where: { recordingId } });
      if (!log || log.userId === "system") return { status: "skipped", reason: "no_sync_log" };
      if (log.syncStatus !== "COMPLETED" || !log.youtubeVideoId) {
        return { status: "skipped", reason: "video_not_ready" };
      }

      const sync = await this.zoomService.getSyncOptions(log.userId, log.meeting);
      if (!sync.captionsEnabled && !options.manual) {
        return { status: "skipped", reason: "captions_off" };
      }

      if (!(await this.youtubeService.hasQuotaFor(log.userId, this.youtubeService.captionUploadCost))) {
        return this.fail(recordingId, "quotaExceeded", "Đã hết quota API YouTube trong ngày, thử lại vào ngày mai");
      }

      await this.setStatus(recordingId, "pending");
      const files = await this.zoomService.fetchRecordingFiles(log.userId, recordingId);
      const transcript = pickTranscriptFile(files);
      if (!transcript?.download_url) {
        await this.setStatus(recordingId, "waiting_transcript");
        return { status: "waiting_transcript" };
      }

      let vtt: string;
      try {
        vtt = await this.zoomService.downloadRecordingText(log.userId, transcript.download_url);
      } catch (error) {
        return this.fail(
          recordingId,
          "TRANSCRIPT_DOWNLOAD_FAILED",
          `Không tải được transcript từ Zoom: ${error.message}`,
        );
      }
      if (!vtt.trim()) {
        await this.setStatus(recordingId, "waiting_transcript");
        return { status: "waiting_transcript" };
      }

      const language = sync.captionLanguage;
      const trackId = await this.youtubeService
        .uploadCaptionTrack(log.userId, log.youtubeVideoId, {
          language,
          name: captionTrackName(language, sync.captionName),
          vtt,
        })
        .catch((error) => {
          if (error instanceof UnauthorizedException) {
            throw Object.assign(new Error("Chưa kết nối YouTube — hãy Authorize trong trang Integrations"), {
              captionCode: "YOUTUBE_NOT_CONNECTED",
            });
          }
          // The video was deleted on YouTube: a known, translated code (P1-2/P1-9)
          const status = error?.code ?? error?.response?.status;
          if (status === 404 || status === "404") {
            throw Object.assign(new Error(SYNC_ERROR_TEXT.VIDEO_NOT_FOUND.vi), {
              captionCode: "VIDEO_NOT_FOUND",
            });
          }
          const { errorCode, errorMessage } = this.youtubeService.describeYoutubeError(error);
          throw Object.assign(new Error(errorMessage), { captionCode: errorCode ?? "YOUTUBE_ERROR" });
        });

      await this.prisma.zoomSyncLog.update({
        where: { recordingId },
        data: {
          captionStatus: "uploaded",
          captionTrackId: trackId || null,
          captionError: null,
          captionErrorCode: null,
          captionAttempts: { increment: 1 },
          captionUpdatedAt: new Date(),
        },
      });
      this.logger.log(`Captions (${language}) uploaded for recording ${recordingId}`);
      return { status: "uploaded" };
    } catch (error) {
      return this.fail(recordingId, error.captionCode ?? "UNKNOWN", error.message);
    }
  }

  private async setStatus(recordingId: string, status: CaptionStatus) {
    await this.prisma.zoomSyncLog.update({
      where: { recordingId },
      data: { captionStatus: status, captionUpdatedAt: new Date() },
    });
  }

  private async fail(recordingId: string, code: string, message: string): Promise<CaptionResult> {
    this.logger.warn(`Captions failed for recording ${recordingId}: ${code} ${message}`);
    try {
      await this.prisma.zoomSyncLog.update({
        where: { recordingId },
        data: {
          captionStatus: "failed",
          captionErrorCode: code,
          captionError: message,
          captionAttempts: { increment: 1 },
          captionUpdatedAt: new Date(),
        },
      });
    } catch (dbError) {
      this.logger.error(`Could not record the caption failure of ${recordingId}: ${dbError.message}`);
    }
    return { status: "failed", reason: code };
  }
}
