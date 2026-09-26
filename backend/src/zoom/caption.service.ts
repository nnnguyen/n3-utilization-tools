import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { YoutubeService } from "../youtube/youtube.service";
import { ZoomService } from "./zoom.service";
import { CaptionStatus, captionTrackName, pickTranscriptFile } from "./captions";

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
