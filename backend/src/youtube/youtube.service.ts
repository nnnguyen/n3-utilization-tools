import { recordingIdFromDescription } from "../zoom/youtube-match";
import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { google } from "googleapis";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import * as fs from "fs";
import { Readable } from "stream";

// Delays before automatic retry 1, 2 and 3 of a sync that failed transiently
export const AUTO_RETRY_DELAYS_MS = [1 * 60_000, 5 * 60_000, 15 * 60_000];
export const MAX_AUTO_RETRIES = AUTO_RETRY_DELAYS_MS.length;

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

const TRANSIENT_YOUTUBE_REASONS = new Set([
  "backendError",
  "internalError",
  "userRateLimitExceeded",
  "rateLimitExceeded",
  "uploadAborted",
]);

// Mapped error codes that retrying cannot fix
const PERMANENT_ERROR_CODES = new Set([
  "quotaExceeded",
  "uploadLimitExceeded",
  "videoDurationTooLong",
  "invalid_grant",
]);

// Google expires refresh tokens after 7 days while the OAuth consent screen is
// in "Testing" mode. The API cannot tell us the mode, so it is configured:
// set YOUTUBE_OAUTH_TESTING_MODE=false once the app is published.
const TESTING_TOKEN_LIFETIME_DAYS = 7;
// Channel Content → Videos: serve the DB cache until it is this old
const CHANNEL_VIDEOS_CACHE_TTL_MS = 60 * 60_000;
// Upper bound per refresh (20 pages of 50) so a huge channel cannot drain quota
const CHANNEL_VIDEOS_MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60_000;

export interface YoutubeConnectionStatus {
  connected: boolean;
  reason?: "not_configured" | "invalid_credentials" | "token_expired";
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string | null;
  longUploadsStatus?: "allowed" | "disallowed" | "eligible" | "unknown";
}

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly QUOTA_LIMIT = parseInt(process.env.YOUTUBE_QUOTA_LIMIT || "10000", 10);
  private readonly UPLOAD_COST = 1650; // Buffer included (1600 official)
  private readonly LIST_COST = 5;
  private readonly PLAYLIST_INSERT_COST = 50;
  // playlists.update/delete and playlistItems.delete: 50 units each (YouTube docs)
  private readonly PLAYLIST_WRITE_COST = 50;
  // One in-flight channel-videos refresh per user, shared by concurrent requests
  private readonly channelVideoRefreshes = new Map<string, Promise<void>>();
  private readonly VIDEO_UPDATE_COST = 50;
  private readonly THUMBNAIL_SET_COST = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async hasQuotaForUpload(userId: string) {
    const quota = await this.getQuotaStatus(userId);
    return quota.unitsRemaining >= this.UPLOAD_COST;
  }

  // Transient = network timeouts/resets and 5xx/429 from YouTube or Zoom.
  // Everything else (quota, duration limit, expired token, 4xx such as a
  // recording deleted on Zoom) is permanent and needs a manual re-sync.
  isTransientSyncError(error: any): boolean {
    if (!error) return false;
    const { errorCode } = this.mapYoutubeError(error);
    if (errorCode && PERMANENT_ERROR_CODES.has(errorCode)) return false;

    // BadRequestException wrappers keep the original error in `cause`
    for (const e of [error, error.cause]) {
      if (!e) continue;
      if (typeof e.code === "string" && TRANSIENT_NETWORK_CODES.has(e.code)) {
        return true;
      }
      const status =
        e.response?.status ?? (typeof e.code === "number" ? e.code : undefined);
      if (status && (status >= 500 || status === 429)) return true;
      const reason = e.response?.data?.error?.errors?.[0]?.reason;
      if (reason && TRANSIENT_YOUTUBE_REASONS.has(reason)) return true;
    }
    return /socket hang up|ECONNRESET|ETIMEDOUT/i.test(error.message || "");
  }

  // Called after a sync log has been marked FAILED. Schedules an automatic
  // retry for transient errors, otherwise notifies the user. Never throws.
  async handleSyncFailure(recordingId: string, error: any) {
    try {
      // Every failed attempt passes through here exactly once
      const log = await this.prisma.zoomSyncLog.update({
        where: { recordingId },
        data: { failureCount: { increment: 1 } },
      });
      if (log.userId === "system") return;

      if (
        this.isTransientSyncError(error) &&
        log.autoRetryCount < MAX_AUTO_RETRIES
      ) {
        const nextRetryAt = new Date(
          Date.now() + AUTO_RETRY_DELAYS_MS[log.autoRetryCount],
        );
        await this.prisma.zoomSyncLog.update({
          where: { recordingId },
          data: { nextRetryAt },
        });
        this.logger.log(
          `Scheduled auto-retry ${log.autoRetryCount + 1}/${MAX_AUTO_RETRIES} for recording ${recordingId} at ${nextRetryAt.toISOString()}`,
        );
        return;
      }

      await this.notifySyncFailed(
        log.userId,
        recordingId,
        log.meeting,
        log.syncError || error.message || "Unknown error",
        log.autoRetryCount,
      );
    } catch (e) {
      this.logger.error(
        `Failed to handle sync failure for recording ${recordingId}`,
        e.stack,
      );
    }
  }

  async notifySyncFailed(
    userId: string,
    recordingId: string,
    meeting: string,
    reason: string,
    autoRetryCount = 0,
  ) {
    const retried =
      autoRetryCount > 0 ? ` (đã tự động thử lại ${autoRetryCount} lần)` : "";
    await this.notificationsService.create({
      userId,
      type: "sync_failed",
      title: "Sync thất bại",
      message: `Sync "${meeting}" thất bại: ${reason}${retried}`,
      link: "/youtube/channel-content?tab=zoom-sync",
      recordingId,
    });
  }

  private getPacificDate(): string {
    // Google resets quota at midnight Pacific Time
    const now = new Date();
    const pacificDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return pacificDate;
  }

  private async trackQuotaUsage(userId: string, units: number) {
    if (!userId || userId === "system") return;

    const date = this.getPacificDate();
    try {
      await this.prisma.youtubeQuotaUsage.upsert({
        where: { userId_date: { userId, date } },
        update: { unitsUsed: { increment: units } },
        create: { userId, date, unitsUsed: units },
      });
    } catch (error) {
      this.logger.error(`Failed to track quota usage for user ${userId}: ${error.message}`);
    }
  }

  async getQuotaStatus(userId: string) {
    const date = this.getPacificDate();
    const usage = await this.prisma.youtubeQuotaUsage.findUnique({
      where: { userId_date: { userId, date } },
    });

    const unitsUsed = usage?.unitsUsed || 0;
    const unitsRemaining = Math.max(0, this.QUOTA_LIMIT - unitsUsed);
    const estimatedUploadsRemaining = Math.floor(unitsRemaining / this.UPLOAD_COST);

    return {
      unitsUsed,
      unitsRemaining,
      quotaLimit: this.QUOTA_LIMIT,
      estimatedUploadsRemaining,
      date,
    };
  }

  private async getOAuthClient(userId?: string) {
    let clientId = process.env.YOUTUBE_CLIENT_ID;
    let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const redirectUri =
      process.env.YOUTUBE_CALLBACK_URL ||
      process.env.YOUTUBE_REDIRECT_URI ||
      `${process.env.FRONTEND_URL}/api/auth/youtube/callback`;

    if (userId && userId !== "system") {
      const config = await this.prisma.youtubeConfig.findUnique({
        where: { userId },
      });
      if (config?.clientId && config?.clientSecret) {
        clientId = config.clientId;
        clientSecret = config.clientSecret;
      }
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
    if (userId && userId !== "system") {
      // Emitted whenever the refresh token is exchanged for an access token,
      // i.e. the refresh token is still valid
      oauth2Client.on("tokens", () => void this.recordTokenRefresh(userId));
    }
    return oauth2Client;
  }

  private isInvalidGrant(error: any) {
    return (
      error?.response?.data?.error === "invalid_grant" ||
      String(error?.message || "").includes("invalid_grant")
    );
  }

  // Never throws: token bookkeeping must not affect the calling flow.
  private async recordTokenRefresh(userId: string) {
    try {
      const now = new Date();
      // Throttled: API calls refresh the token often, one write per 5 min is enough
      await this.prisma.youtubeConfig.updateMany({
        where: {
          userId,
          OR: [
            { lastTokenRefreshAt: null },
            { lastTokenRefreshAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
            { tokenInvalidAt: { not: null } },
          ],
        },
        data: { lastTokenRefreshAt: now, tokenInvalidAt: null },
      });
    } catch (error) {
      this.logger.warn(`Failed to record token refresh for ${userId}: ${error.message}`);
    }
  }

  private async recordTokenError(userId: string | undefined, error: any) {
    if (!userId || userId === "system" || !this.isInvalidGrant(error)) return;
    try {
      await this.prisma.youtubeConfig.updateMany({
        where: { userId, tokenInvalidAt: null },
        data: { tokenInvalidAt: new Date() },
      });
      this.logger.warn(`YouTube refresh token rejected (invalid_grant) for user ${userId}`);
    } catch (e) {
      this.logger.warn(`Failed to record token error for ${userId}: ${e.message}`);
    }
  }

  // Cheap (DB only, no API call), so the UI can poll it for the banner.
  async getTokenStatus(userId: string) {
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
      select: {
        refreshToken: true,
        isActive: true,
        tokenObtainedAt: true,
        lastTokenRefreshAt: true,
        tokenInvalidAt: true,
      },
    });
    const testingMode = process.env.YOUTUBE_OAUTH_TESTING_MODE !== "false";
    const warnAfterDays = parseInt(
      process.env.YOUTUBE_TOKEN_WARN_AFTER_DAYS || "5",
      10,
    );

    if (!config?.isActive || !config.refreshToken) {
      return { configured: false, testingMode, tokenInvalid: false, expiringSoon: false };
    }

    let expiresAt: Date | null = null;
    let daysRemaining: number | null = null;
    let expiringSoon = false;
    if (testingMode && config.tokenObtainedAt) {
      const obtained = config.tokenObtainedAt.getTime();
      expiresAt = new Date(obtained + TESTING_TOKEN_LIFETIME_DAYS * DAY_MS);
      daysRemaining = Math.max(
        0,
        Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS),
      );
      expiringSoon = Date.now() - obtained >= warnAfterDays * DAY_MS;
    }

    return {
      configured: true,
      testingMode,
      tokenObtainedAt: config.tokenObtainedAt,
      lastTokenRefreshAt: config.lastTokenRefreshAt,
      expiresAt,
      daysRemaining,
      tokenInvalid: !!config.tokenInvalidAt,
      tokenInvalidAt: config.tokenInvalidAt,
      expiringSoon: expiringSoon && !config.tokenInvalidAt,
    };
  }

  async getAuthUrl(userId: string): Promise<string> {
    const oauth2Client = await this.getOAuthClient(userId);

    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ];

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
      state: userId,
    });
  }

  async handleCallback(userId: string, code: string) {
    const oauth2Client = await this.getOAuthClient(userId);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      this.logger.warn(`No refresh token returned for user ${userId}`);
    }

    const now = new Date();
    // Only a newly issued refresh token restarts the expiry clock
    const tokenLifecycle = tokens.refresh_token
      ? { tokenObtainedAt: now, lastTokenRefreshAt: now, tokenInvalidAt: null }
      : {};

    await this.prisma.youtubeConfig.upsert({
      where: { userId },
      update: {
        refreshToken: tokens.refresh_token ?? undefined,
        isActive: true,
        ...tokenLifecycle,
      },
      create: {
        userId,
        refreshToken: tokens.refresh_token || "",
        isActive: true,
        ...tokenLifecycle,
      },
    });

    return tokens;
  }

  // Real connection check, not just "are the env vars set": a refresh token
  // can be present but revoked or expired, so this calls channels.list(mine)
  // to confirm it still authenticates against a real channel.
  async getConnectionStatus(userId: string): Promise<YoutubeConnectionStatus> {
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
    });

    const clientId = config?.clientId || process.env.YOUTUBE_CLIENT_ID;
    const clientSecret =
      config?.clientSecret || process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken =
      config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;

    if (!config?.isActive || !clientId || !clientSecret || !refreshToken) {
      return { connected: false, reason: "not_configured" };
    }

    try {
      const oauth2Client = await this.getOAuthClient(userId);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const res = await youtube.channels.list({
        part: ["snippet", "status"],
        mine: true,
      });

      await this.trackQuotaUsage(userId, this.LIST_COST);

      const channel = res.data.items?.[0];
      if (!channel) {
        return { connected: false, reason: "invalid_credentials" };
      }

      return {
        connected: true,
        channelId: channel.id ?? undefined,
        channelTitle: channel.snippet?.title ?? undefined,
        channelThumbnail: channel.snippet?.thumbnails?.default?.url ?? null,
        longUploadsStatus: (channel.status?.longUploadsStatus as any) || "unknown",
      };
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.warn(
        `YouTube connection check failed for user ${userId}: ${error.message ?? error}`,
      );
      return {
        connected: false,
        reason: this.isInvalidGrant(error) ? "token_expired" : "invalid_credentials",
      };
    }
  }

  async uploadVideo(
    filePath: string,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "private",
    userId: string = "system",
    playlistId?: string,
  ) {
    const stream: any = fs.createReadStream(filePath);
    // Lets onUploadProgress compute a real percentage
    stream.length = fs.statSync(filePath).size;
    return this.uploadVideoFromStream(
      stream,
      title,
      description,
      privacyStatus,
      userId,
      undefined,
      undefined,
      playlistId,
    );
  }

  // Manual Video Uploader: the file was already saved to a temp path by multer.
  async uploadManualVideo(
    userId: string,
    filePath: string,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "private",
    playlistId?: string,
  ) {
    const quota = await this.getQuotaStatus(userId);
    if (quota.unitsRemaining < this.UPLOAD_COST) {
      throw new BadRequestException(
        "Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai",
      );
    }

    const result = await this.uploadVideo(
      filePath,
      title,
      description,
      privacyStatus,
      userId,
      playlistId,
    );
    if (!result) {
      throw new UnauthorizedException("YouTube not connected");
    }
    return result;
  }

  async uploadVideoFromStream(
    stream: any,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "private",
    userId: string = "system",
    onProgress?: (progress: number) => void,
    recordingId?: string,
    playlistId?: string,
    tags?: string[],
    // ISO 8601; YouTube publishes the (private) video at this time
    publishAt?: string,
  ) {
    try {
      if (recordingId) {
        try {
          await this.prisma.zoomSyncLog.update({
            where: { recordingId },
            data: {
              syncStatus: "UPLOADING",
              syncStartedAt: new Date(),
              playlistId: playlistId || null,
              playlistError: null,
            },
          });
        } catch (dbError) {
          this.logger.error(
            `Failed to update status to UPLOADING for recording ${recordingId}`,
            dbError.stack,
          );
        }
      }
      const config =
        userId !== "system"
          ? await this.prisma.youtubeConfig.findUnique({ where: { userId } })
          : null;

      const refreshToken =
        config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;

      if (!config?.isActive || !refreshToken) {
        this.logger.debug(
          `YouTube is not configured or active for user ${userId}, skipping upload`,
        );
        return null;
      }

      const oauth2Client = await this.getOAuthClient(userId);
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const youtube = google.youtube({
        version: "v3",
        auth: oauth2Client,
      });

      const res = await youtube.videos.insert(
        {
          part: ["snippet", "status"],
          requestBody: {
            snippet: {
              title,
              description,
              ...(tags?.length ? { tags } : {}),
            },
            status: {
              privacyStatus,
              ...(publishAt ? { publishAt } : {}),
            },
          },
          media: {
            body: stream,
          },
        },
        {
          // Support for progress monitoring
          onUploadProgress: (evt) => {
            if (onProgress && evt.bytesRead) {
              // Note: For streams, total size might not be known by the event
              // unless we set it or it's provided by the stream.
              // YouTube API insert usually knows the content length if it's a file stream,
              // but for passthrough streams it might be harder.
              const progress = Math.round(
                (evt.bytesRead / (stream.length || 1)) * 100,
              );
              // If total size is unknown, we might just report bytesRead or a generic progress
              onProgress(progress);
            }
          },
        },
      );

      await this.trackQuotaUsage(userId, this.UPLOAD_COST);

      this.logger.log(`Video uploaded successfully: ${res.data.id}`);

      if (recordingId && res.data.id) {
        try {
          await this.prisma.zoomSyncLog.update({
            where: { recordingId },
            data: {
              syncStatus: "PROCESSING",
              youtubeVideoId: res.data.id,
              youtubeId: res.data.id,
            },
          });
        } catch (dbError) {
          this.logger.error(
            `Failed to update status to PROCESSING for recording ${recordingId}`,
            dbError.stack,
          );
        }
      }

      // Playlist assignment is best-effort: the upload already succeeded, so a
      // failure here is recorded separately and never fails the sync.
      let playlistErrorMessage: string | null = null;
      if (res.data.id && playlistId) {
        try {
          await this.addVideoToPlaylist(userId, playlistId, res.data.id);
        } catch (playlistError) {
          const { errorMessage } = this.mapYoutubeError(playlistError);
          playlistErrorMessage = errorMessage;
          if (recordingId) {
            try {
              await this.prisma.zoomSyncLog.update({
                where: { recordingId },
                data: { playlistError: errorMessage },
              });
            } catch (dbError) {
              this.logger.error(
                `Failed to save playlist error for recording ${recordingId}`,
                dbError.stack,
              );
            }
          }
        }
      }

      return { ...res.data, playlistError: playlistErrorMessage };
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error("Error uploading video to YouTube", error.stack);

      if (recordingId) {
        try {
          const { errorMessage, errorCode } = this.mapYoutubeError(error);
          await this.prisma.zoomSyncLog.update({
            where: { recordingId },
            data: {
              syncStatus: "FAILED",
              syncError: errorMessage,
              errorSource: "upload",
              errorCode: errorCode,
              errorMessage: error.message,
            },
          });
        } catch (dbError) {
          this.logger.error(
            `Failed to update status to FAILED for recording ${recordingId}`,
            dbError.stack,
          );
        }
        await this.handleSyncFailure(recordingId, error);
        return null; // Return null instead of throwing as per requirement
      }

      throw new BadRequestException(
        `Failed to upload video to YouTube: ${error.message}`,
      );
    }
  }

  private mapYoutubeError(error: any): {
    errorMessage: string;
    errorCode: string | null;
  } {
    const message = error.message || "";
    const code = error.code || error.response?.data?.error?.code || null;
    const errors = error.response?.data?.error?.errors || [];
    const reason = errors[0]?.reason || "";

    if (
      reason === "uploadLimitExceeded" ||
      (code === 403 && message.includes("uploadLimitExceeded"))
    ) {
      return {
        errorMessage: "Kênh YouTube đã đạt giới hạn upload trong ngày",
        errorCode: "uploadLimitExceeded",
      };
    }

    if (
      message.includes("exceeds the maximum duration") ||
      reason === "videoDurationTooLong"
    ) {
      return {
        errorMessage:
          "Video quá dài — channel YouTube cần xác minh số điện thoại để upload video dài hơn 15 phút",
        errorCode: "videoDurationTooLong",
      };
    }

    if (
      message.includes("invalid_grant") ||
      message.includes("Token expired") ||
      code === 401
    ) {
      return {
        errorMessage:
          "Token xác thực YouTube đã hết hạn — cần Authorize lại trong trang Integrations",
        errorCode: "invalid_grant",
      };
    }

    if (
      reason === "quotaExceeded" ||
      (code === 403 && message.includes("quotaExceeded"))
    ) {
      return {
        errorMessage:
          "Đã hết quota API YouTube trong ngày, thử lại vào ngày mai",
        errorCode: "quotaExceeded",
      };
    }

    if (message.includes("ENOTFOUND") || message.includes("ETIMEDOUT")) {
      return {
        errorMessage:
          "Không tải được file từ Zoom (link download có thể đã hết hạn hoặc lỗi mạng)",
        errorCode: "networkError",
      };
    }

    return {
      errorMessage: message,
      errorCode: code ? code.toString() : null,
    };
  }

  async checkVideoProcessingStatus(
    videoId: string,
    recordingId?: string,
    userId?: string,
  ) {
    this.logger.log(
      `Checking status for video ${videoId} (recording: ${recordingId}, user: ${userId})`,
    );
    try {
      let finalUserId = userId;

      // If userId is not provided but recordingId is, find the userId from the log
      if (!finalUserId && recordingId) {
        const log = await this.prisma.zoomSyncLog.findUnique({
          where: { recordingId },
          select: { userId: true },
        });
        if (log) {
          finalUserId = log.userId;
        }
      }

      // Find the specific config for the user
      const config = finalUserId
        ? await this.prisma.youtubeConfig.findUnique({
            where: { userId: finalUserId },
          })
        : await this.prisma.youtubeConfig.findFirst({
            where: { isActive: true },
          });

      if (!config || !config.isActive || !config.refreshToken) {
        const errorMsg = `No active YouTube configuration or refresh token found${finalUserId ? ` for user ${finalUserId}` : ""}`;
        this.logger.error(errorMsg);
        if (recordingId) {
          await this.prisma.zoomSyncLog.update({
            where: { recordingId },
            data: {
              syncStatus: "FAILED",
              syncError: errorMsg,
              errorSource: "youtube_processing",
              errorMessage: errorMsg,
            },
          });
        }
        throw new Error(errorMsg);
      }

      const oauth2Client = await this.getOAuthClient(config.userId);
      oauth2Client.setCredentials({
        refresh_token: config.refreshToken,
      });

      const youtube = google.youtube({
        version: "v3",
        auth: oauth2Client,
      });

      const res = await youtube.videos.list({
        part: ["status", "processingDetails"],
        id: [videoId],
      });

      if (config.userId) {
        await this.trackQuotaUsage(config.userId, this.LIST_COST);
      }

      const video = res.data.items?.[0];
      if (!video) {
        if (!recordingId) {
          throw new Error("Video not found on YouTube");
        }
        await this.markVideoDeleted(recordingId, videoId);
        return {
          syncStatus: "FAILED" as const,
          uploadStatus: undefined,
          processingStatus: undefined,
          youtubeVideoId: videoId,
        };
      }

      const uploadStatus = video.status?.uploadStatus; // uploaded, processed, failed, rejected
      const processingStatus = video.processingDetails?.processingStatus; // processing, succeeded, failed, terminated

      let newSyncStatus: "COMPLETED" | "FAILED" | "PROCESSING" = "PROCESSING";
      let syncCompletedAt: Date | undefined = undefined;
      let syncError: string | null = null;

      // Logic mapping based on both uploadStatus and processingStatus
      if (uploadStatus === "processed" && processingStatus === "succeeded") {
        newSyncStatus = "COMPLETED";
        syncCompletedAt = new Date();
      } else if (
        uploadStatus === "failed" ||
        uploadStatus === "rejected" ||
        processingStatus === "failed" ||
        processingStatus === "terminated"
      ) {
        newSyncStatus = "FAILED";
        syncError =
          video.status?.failureReason ||
          video.processingDetails?.processingFailureReason ||
          "YouTube processing failed";
      } else if (
        uploadStatus === "uploaded" &&
        processingStatus === "processing"
      ) {
        newSyncStatus = "PROCESSING";
      }

      if (recordingId) {
        const processingError = {
          message: syncError,
          code: video.status?.failureReason,
          response: {
            data: {
              error: {
                errors: [{ reason: video.status?.failureReason }],
              },
            },
          },
        };
        const errorMapping =
          newSyncStatus === "FAILED"
            ? this.mapYoutubeError(processingError)
            : { errorMessage: syncError, errorCode: null };

        const data = {
          syncStatus: newSyncStatus,
          youtubeProcessingStatus: processingStatus,
          syncCompletedAt,
          syncError: errorMapping.errorMessage,
          errorSource: newSyncStatus === "FAILED" ? "youtube_processing" : null,
          errorCode:
            errorMapping.errorCode || video.status?.failureReason || null,
          errorMessage: syncError,
        };

        if (newSyncStatus === "PROCESSING") {
          await this.prisma.zoomSyncLog.update({ where: { recordingId }, data });
        } else {
          // Only the check that actually moves the log into its final state
          // notifies, so the frontend poll and the background job running at
          // the same time cannot create duplicate notifications.
          const { count } = await this.prisma.zoomSyncLog.updateMany({
            where: { recordingId, syncStatus: { not: newSyncStatus } },
            data,
          });
          if (count > 0) {
            if (newSyncStatus === "COMPLETED") {
              await this.notifySyncCompleted(recordingId, videoId);
            } else {
              await this.handleSyncFailure(recordingId, processingError);
            }
          }
        }
      }

      return {
        syncStatus: newSyncStatus,
        uploadStatus,
        processingStatus,
        youtubeVideoId: videoId,
      };
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(
        `Error checking YouTube video status for ${videoId}`,
        error.stack,
      );
      throw error;
    }
  }

  // The video was deleted on YouTube: a final failure (no auto-retry). Only the
  // check that moves the log to FAILED logs and notifies, so the frontend poll
  // and the background job stop quietly afterwards.
  private async markVideoDeleted(recordingId: string, videoId: string) {
    const syncError = "Video đã bị xoá trên YouTube";
    const { count } = await this.prisma.zoomSyncLog.updateMany({
      where: { recordingId, syncStatus: { not: "FAILED" } },
      data: {
        syncStatus: "FAILED",
        syncError,
        errorSource: "youtube_processing",
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Video not found on YouTube",
        nextRetryAt: null,
      },
    });
    if (count === 0) return;

    this.logger.warn(
      `Video ${videoId} of recording ${recordingId} was deleted on YouTube; sync marked as failed`,
    );
    await this.handleSyncFailure(recordingId, new Error(syncError));
  }

  private async notifySyncCompleted(recordingId: string, videoId: string) {
    const log = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
      select: { userId: true, meeting: true },
    });
    if (!log) return;
    await this.notificationsService.create({
      userId: log.userId,
      type: "sync_completed",
      title: "Video đã sẵn sàng",
      message: `Video "${log.meeting}" đã sẵn sàng để xem`,
      link: `https://www.youtube.com/watch?v=${videoId}`,
      recordingId,
    });
  }

  async getRecordingStatusFromDb(recordingId: string) {
    const log = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
      select: {
        syncStatus: true,
        youtubeVideoId: true,
        syncError: true,
      },
    });

    if (!log) {
      throw new BadRequestException("Sync log not found");
    }

    return log;
  }

  async refreshRecordingStatus(recordingId: string, userId?: string) {
    const log = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
    });

    if (!log || !log.youtubeVideoId) {
      throw new BadRequestException(
        "No YouTube video ID found for this recording",
      );
    }

    return this.checkVideoProcessingStatus(
      log.youtubeVideoId,
      recordingId,
      userId || log.userId,
    );
  }

  // Without `since`: the `limit` newest videos. With `since`: every video
  // published after that date (the uploads playlist is newest first), capped
  // at MAX_PAGES pages so a large channel cannot burn quota.
  async getRecentUploads(userId: string, limit = 10, since?: Date) {
    const PAGE_SIZE = 50;
    const MAX_PAGES = 4;
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
    });

    const refreshToken =
      config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;

    if (!config?.isActive || !refreshToken) {
      throw new UnauthorizedException("YouTube not connected");
    }

    try {
      const oauth2Client = await this.getOAuthClient(userId);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const youtube = google.youtube({ version: "v3", auth: oauth2Client });

      // First, get the channel's uploads playlist ID
      const channelRes = await youtube.channels.list({
        part: ["contentDetails"],
        mine: true,
      });

      await this.trackQuotaUsage(userId, this.LIST_COST);

      const uploadsPlaylistId =
        channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return [];
      }

      // Then, get the videos from that playlist
      const items: any[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < (since ? MAX_PAGES : 1); page++) {
        const playlistItemsRes = await youtube.playlistItems.list({
          part: ["snippet", "status", "contentDetails"],
          playlistId: uploadsPlaylistId,
          maxResults: since ? PAGE_SIZE : limit,
          pageToken,
        });
        await this.trackQuotaUsage(userId, this.LIST_COST);

        const pageItems = playlistItemsRes.data.items || [];
        items.push(...pageItems);
        pageToken = playlistItemsRes.data.nextPageToken ?? undefined;
        const oldest = pageItems[pageItems.length - 1]?.snippet?.publishedAt;
        if (!since || !pageToken || (oldest && new Date(oldest) < since)) {
          break;
        }
      }

      const inRange = since
        ? items.filter(
            (item) =>
              item.snippet?.publishedAt &&
              new Date(item.snippet.publishedAt) >= since,
          )
        : items;

      return inRange.map((item) => ({
        id: item.contentDetails?.videoId,
        title: item.snippet?.title,
        description: item.snippet?.description,
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url,
        publishedAt: item.snippet?.publishedAt,
        privacyStatus: item.status?.privacyStatus,
      }));
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(
        `Error fetching recent YouTube uploads for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  async listPlaylists(userId: string) {
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
    });
    const refreshToken = config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;
    if (!config?.isActive || !refreshToken) {
      throw new UnauthorizedException("YouTube not connected");
    }
    try {
      const oauth2Client = await this.getOAuthClient(userId);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      // Up to 4 pages (200 playlists); each page is one list call
      const items: any[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 4; page++) {
        const res = await youtube.playlists.list({
          part: ["snippet", "contentDetails", "status"],
          mine: true,
          maxResults: 50,
          pageToken,
        });
        await this.trackQuotaUsage(userId, this.LIST_COST);
        items.push(...(res.data.items || []));
        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
      return items.map((p) => ({
        id: p.id,
        title: p.snippet?.title,
        description: p.snippet?.description ?? "",
        itemCount: p.contentDetails?.itemCount ?? 0,
        privacyStatus: p.status?.privacyStatus ?? null,
        publishedAt: p.snippet?.publishedAt ?? null,
        thumbnail:
          p.snippet?.thumbnails?.medium?.url ||
          p.snippet?.thumbnails?.default?.url ||
          null,
      }));
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(`Error listing playlists for user ${userId}`, error.stack);
      throw error;
    }
  }

  async createPlaylist(
    userId: string,
    title: string,
    privacyStatus: "public" | "private" | "unlisted" = "private",
    description?: string,
  ) {
    if (!title?.trim()) {
      throw new BadRequestException("Playlist title is required");
    }
    // YouTube rejects playlist titles longer than 150 characters
    if (title.trim().length > 150) {
      throw new BadRequestException("Playlist title must be at most 150 characters");
    }
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
    });
    const refreshToken = config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;
    if (!config?.isActive || !refreshToken) {
      throw new UnauthorizedException("YouTube not connected");
    }
    try {
      const oauth2Client = await this.getOAuthClient(userId);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const res = await youtube.playlists.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: { title: title.trim(), description: description ?? "" },
          status: { privacyStatus },
        },
      });
      await this.trackQuotaUsage(userId, this.PLAYLIST_INSERT_COST);
      return { id: res.data.id, title: res.data.snippet?.title };
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(`Error creating playlist for user ${userId}`, error.stack);
      throw error;
    }
  }

  async addVideoToPlaylist(userId: string, playlistId: string, videoId: string) {
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
    });
    const refreshToken = config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;
    if (!config?.isActive || !refreshToken) {
      throw new UnauthorizedException("YouTube not connected");
    }
    try {
      const oauth2Client = await this.getOAuthClient(userId);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      await youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: "youtube#video",
              videoId,
            },
          },
        },
      });
      await this.trackQuotaUsage(userId, this.PLAYLIST_INSERT_COST);
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(
        `Error adding video ${videoId} to playlist ${playlistId} for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  private async getYoutubeClient(userId: string) {
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
    });
    const refreshToken = config?.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;
    if (!config?.isActive || !refreshToken) {
      throw new UnauthorizedException("YouTube not connected");
    }
    const oauth2Client = await this.getOAuthClient(userId);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.youtube({ version: "v3", auth: oauth2Client });
  }

  private async fetchVideo(userId: string, videoId: string) {
    const youtube = await this.getYoutubeClient(userId);
    const res = await youtube.videos.list({
      part: ["snippet", "status"],
      id: [videoId],
    });
    await this.trackQuotaUsage(userId, this.LIST_COST);
    const video = res.data.items?.[0];
    if (!video) {
      throw new BadRequestException("Video not found on YouTube");
    }
    return { youtube, video };
  }

  async getVideoMetadata(userId: string, videoId: string) {
    try {
      const { video } = await this.fetchVideo(userId, videoId);
      return {
        id: video.id,
        title: video.snippet?.title ?? "",
        description: video.snippet?.description ?? "",
        tags: video.snippet?.tags ?? [],
        privacyStatus: video.status?.privacyStatus ?? "private",
        thumbnail:
          video.snippet?.thumbnails?.medium?.url ||
          video.snippet?.thumbnails?.default?.url ||
          null,
      };
    } catch (error) {
      void this.recordTokenError(userId, error);
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error fetching video ${videoId} for user ${userId}`, error.stack);
      throw new BadRequestException(this.mapYoutubeError(error).errorMessage);
    }
  }

  // videos.update replaces the whole snippet/status parts, so the current
  // values are fetched first and only the edited fields are overridden.
  async updateVideoMetadata(
    userId: string,
    videoId: string,
    update: {
      title: string;
      description?: string;
      tags?: string[];
      privacyStatus?: "public" | "private" | "unlisted";
    },
  ) {
    const tags = (update.tags || []).map((t) => t.trim()).filter(Boolean);
    // YouTube caps the combined tag length at 500 characters (commas included)
    if (tags.join(",").length > 500) {
      throw new BadRequestException("Tags must be at most 500 characters in total");
    }

    try {
      const { youtube, video } = await this.fetchVideo(userId, videoId);
      const snippet = video.snippet || {};
      const status = video.status || {};
      const privacyStatus = update.privacyStatus || status.privacyStatus || "private";

      const res = await youtube.videos.update({
        part: ["snippet", "status"],
        requestBody: {
          id: videoId,
          snippet: {
            title: update.title.trim(),
            description: update.description ?? snippet.description ?? "",
            tags: update.tags ? tags : snippet.tags,
            categoryId: snippet.categoryId,
            defaultLanguage: snippet.defaultLanguage,
          },
          status: {
            privacyStatus,
            embeddable: status.embeddable,
            license: status.license,
            publicStatsViewable: status.publicStatsViewable,
            selfDeclaredMadeForKids: status.selfDeclaredMadeForKids,
            // A scheduled publish time is only valid on private videos
            publishAt: privacyStatus === "private" ? status.publishAt : undefined,
          },
        },
      });
      await this.trackQuotaUsage(userId, this.VIDEO_UPDATE_COST);
      await this.updateChannelVideoCache(userId, videoId, {
        title: res.data.snippet?.title ?? undefined,
        privacyStatus: res.data.status?.privacyStatus ?? undefined,
      });

      return {
        id: res.data.id,
        title: res.data.snippet?.title,
        description: res.data.snippet?.description,
        tags: res.data.snippet?.tags ?? [],
        privacyStatus: res.data.status?.privacyStatus,
      };
    } catch (error) {
      void this.recordTokenError(userId, error);
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error updating video ${videoId} for user ${userId}`, error.stack);
      throw new BadRequestException(this.mapYoutubeError(error).errorMessage);
    }
  }

  async setThumbnail(
    userId: string,
    videoId: string,
    image: Buffer,
    mimeType: string,
  ) {
    try {
      const youtube = await this.getYoutubeClient(userId);
      const res = await youtube.thumbnails.set({
        videoId,
        media: { mimeType, body: Readable.from(image) },
      });
      await this.trackQuotaUsage(userId, this.THUMBNAIL_SET_COST);
      const thumbnails = res.data.items?.[0];
      const newThumbnail = thumbnails?.medium?.url || thumbnails?.default?.url;
      if (newThumbnail) {
        await this.updateChannelVideoCache(userId, videoId, { thumbnail: newThumbnail });
      }
      return {
        thumbnail:
          thumbnails?.medium?.url || thumbnails?.default?.url || null,
      };
    } catch (error) {
      void this.recordTokenError(userId, error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error setting thumbnail for video ${videoId}`, error.stack);
      const code = error.code || error.response?.status;
      if (code === 403) {
        throw new BadRequestException(
          "Channel chưa được phép dùng thumbnail tuỳ chỉnh — cần xác minh channel tại https://www.youtube.com/verify",
        );
      }
      throw new BadRequestException(this.mapYoutubeError(error).errorMessage);
    }
  }

  // Turns playlist API failures into messages the user can act on
  private playlistError(error: any, fallback: string) {
    if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
      return error;
    }
    const status = error.code ?? error.response?.status;
    const reason = error.response?.data?.error?.errors?.[0]?.reason;
    if (status === 404 || reason === "playlistNotFound" || reason === "playlistItemNotFound") {
      return new NotFoundException(
        "Playlist hoặc video không còn tồn tại (có thể đã bị xoá trong YouTube Studio). Hãy tải lại danh sách.",
      );
    }
    if (status === 403 || reason === "playlistForbidden" || reason === "playlistItemsNotAccessible") {
      return new ForbiddenException(
        "Không có quyền thay đổi playlist này — playlist không thuộc kênh YouTube đang kết nối.",
      );
    }
    const mapped = this.mapYoutubeError(error);
    return new BadRequestException(`${fallback}: ${mapped.errorMessage}`);
  }

  async updatePlaylist(
    userId: string,
    playlistId: string,
    update: {
      title: string;
      description?: string;
      privacyStatus?: "public" | "private" | "unlisted";
    },
  ) {
    try {
      const youtube = await this.getYoutubeClient(userId);
      // playlists.update replaces the whole snippet/status, so fields not
      // being edited (e.g. defaultLanguage) are carried over from the current value
      const current = await youtube.playlists.list({
        part: ["snippet", "status"],
        id: [playlistId],
      });
      await this.trackQuotaUsage(userId, this.LIST_COST);
      const playlist = current.data.items?.[0];
      if (!playlist) {
        throw new NotFoundException(
          "Playlist không còn tồn tại (có thể đã bị xoá trong YouTube Studio). Hãy tải lại danh sách.",
        );
      }

      const res = await youtube.playlists.update({
        part: ["snippet", "status"],
        requestBody: {
          id: playlistId,
          snippet: {
            title: update.title.trim(),
            description: update.description ?? playlist.snippet?.description ?? "",
            defaultLanguage: playlist.snippet?.defaultLanguage,
          },
          status: {
            privacyStatus: update.privacyStatus || playlist.status?.privacyStatus || "private",
          },
        },
      });
      await this.trackQuotaUsage(userId, this.PLAYLIST_WRITE_COST);
      return {
        id: res.data.id,
        title: res.data.snippet?.title,
        description: res.data.snippet?.description ?? "",
        privacyStatus: res.data.status?.privacyStatus ?? null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      void this.recordTokenError(userId, error);
      this.logger.error(`Error updating playlist ${playlistId} for user ${userId}`, error.stack);
      throw this.playlistError(error, "Không cập nhật được playlist");
    }
  }

  // Deletes only the playlist; the videos in it stay on the channel.
  async deletePlaylist(userId: string, playlistId: string) {
    try {
      const youtube = await this.getYoutubeClient(userId);
      await youtube.playlists.delete({ id: playlistId });
      await this.trackQuotaUsage(userId, this.PLAYLIST_WRITE_COST);
      return { success: true };
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(`Error deleting playlist ${playlistId} for user ${userId}`, error.stack);
      throw this.playlistError(error, "Không xoá được playlist");
    }
  }

  async listPlaylistItems(userId: string, playlistId: string) {
    try {
      const youtube = await this.getYoutubeClient(userId);
      // Up to 4 pages (200 videos); each page is one list call
      const items: any[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 4; page++) {
        const res = await youtube.playlistItems.list({
          part: ["snippet", "contentDetails", "status"],
          playlistId,
          maxResults: 50,
          pageToken,
        });
        await this.trackQuotaUsage(userId, this.LIST_COST);
        items.push(...(res.data.items || []));
        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
      return items.map((item) => ({
        // Needed to remove the entry: playlistItems.delete takes this id, not the video id
        playlistItemId: item.id,
        videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          null,
        position: item.snippet?.position ?? null,
        privacyStatus: item.status?.privacyStatus ?? null,
        videoPublishedAt: item.contentDetails?.videoPublishedAt ?? null,
      }));
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(`Error listing items of playlist ${playlistId} for user ${userId}`, error.stack);
      throw this.playlistError(error, "Không tải được danh sách video của playlist");
    }
  }

  // Removes one entry from a playlist; the video itself is not deleted.
  async removePlaylistItem(userId: string, playlistItemId: string) {
    try {
      const youtube = await this.getYoutubeClient(userId);
      await youtube.playlistItems.delete({ id: playlistItemId });
      await this.trackQuotaUsage(userId, this.PLAYLIST_WRITE_COST);
      return { success: true };
    } catch (error) {
      void this.recordTokenError(userId, error);
      this.logger.error(`Error removing playlist item ${playlistItemId} for user ${userId}`, error.stack);
      throw this.playlistError(error, "Không gỡ được video khỏi playlist");
    }
  }

  // "PT1H2M3S" / "P1DT2H" -> seconds
  private parseIsoDuration(value?: string | null): number | null {
    const m = value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return null;
    const [, d, h, min, sec] = m.map((v) => (v ? parseInt(v, 10) : 0));
    return d * 86400 + h * 3600 + min * 60 + sec;
  }

  private toCount(value?: string | null): number | null {
    if (value == null) return null;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }

  // Every video on the channel, read from the channel's "uploads" playlist
  // (1 unit per 50 videos) instead of search.list (100 units per 50, and
  // it can miss private or recently uploaded videos), then enriched with
  // videos.list (1 unit per batch of 50 ids).
  private async refreshChannelVideos(userId: string) {
    const youtube = await this.getYoutubeClient(userId);
    const channelRes = await youtube.channels.list({
      part: ["contentDetails"],
      mine: true,
    });
    await this.trackQuotaUsage(userId, this.LIST_COST);
    const uploadsPlaylistId =
      channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    const videoIds: string[] = [];
    if (uploadsPlaylistId) {
      let pageToken: string | undefined;
      for (let page = 0; page < CHANNEL_VIDEOS_MAX_PAGES; page++) {
        const res = await youtube.playlistItems.list({
          part: ["contentDetails"],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken,
        });
        await this.trackQuotaUsage(userId, this.LIST_COST);
        for (const item of res.data.items || []) {
          if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
        }
        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
    }

    const rows: any[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const res = await youtube.videos.list({
        part: ["snippet", "statistics", "status", "contentDetails"],
        id: videoIds.slice(i, i + 50),
        maxResults: 50,
      });
      await this.trackQuotaUsage(userId, this.LIST_COST);
      for (const v of res.data.items || []) {
        if (!v.id) continue;
        rows.push({
          userId,
          videoId: v.id,
          title: v.snippet?.title ?? "",
          thumbnail:
            v.snippet?.thumbnails?.medium?.url ||
            v.snippet?.thumbnails?.default?.url ||
            null,
          privacyStatus: v.status?.privacyStatus ?? null,
          durationSeconds: this.parseIsoDuration(v.contentDetails?.duration),
          viewCount: this.toCount(v.statistics?.viewCount),
          likeCount: this.toCount(v.statistics?.likeCount),
          commentCount: this.toCount(v.statistics?.commentCount),
          publishedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
          zoomRecordingId: recordingIdFromDescription(v.snippet?.description),
        });
      }
    }

    // Replace the snapshot so videos deleted on YouTube disappear too
    const fetchedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.channelVideoCache.deleteMany({ where: { userId } }),
      this.prisma.channelVideoCache.createMany({
        data: rows.map((r) => ({ ...r, fetchedAt })),
      }),
      this.prisma.youtubeConfig.update({
        where: { userId },
        data: { channelVideosFetchedAt: fetchedAt },
      }),
    ]);
  }

  // cacheOnly: never call YouTube, just report whether the cache is stale
  // (Analytics shows a "Refresh now" prompt instead of spending quota)
  async getChannelVideos(userId: string, forceRefresh = false, cacheOnly = false) {
    const config = await this.prisma.youtubeConfig.findUnique({
      where: { userId },
      select: { channelVideosFetchedAt: true },
    });
    const lastFetchedAt = config?.channelVideosFetchedAt ?? null;
    const stale =
      !lastFetchedAt ||
      Date.now() - lastFetchedAt.getTime() > CHANNEL_VIDEOS_CACHE_TTL_MS;

    let refreshError: string | null = null;
    if (!cacheOnly && (forceRefresh || stale)) {
      try {
        let refresh = this.channelVideoRefreshes.get(userId);
        if (!refresh) {
          refresh = this.refreshChannelVideos(userId).finally(() =>
            this.channelVideoRefreshes.delete(userId),
          );
          this.channelVideoRefreshes.set(userId, refresh);
        }
        await refresh;
      } catch (error) {
        void this.recordTokenError(userId, error);
        this.logger.error(`Error refreshing channel videos for user ${userId}`, error.stack);
        if (error instanceof UnauthorizedException) throw error;
        // With a cache, keep serving it and report the failure; without one there is nothing to show
        refreshError = this.mapYoutubeError(error).errorMessage;
        if (!lastFetchedAt) {
          throw new BadRequestException(`Không tải được danh sách video: ${refreshError}`);
        }
      }
    }

    const [videos, updated] = await Promise.all([
      this.prisma.channelVideoCache.findMany({
        where: { userId },
        orderBy: { publishedAt: "desc" },
      }),
      this.prisma.youtubeConfig.findUnique({
        where: { userId },
        select: { channelVideosFetchedAt: true },
      }),
    ]);

    // Soft link to Zoom sync: which videos came from a synced recording
    const syncLogs = await this.prisma.zoomSyncLog.findMany({
      where: { userId, youtubeVideoId: { in: videos.map((v) => v.videoId) } },
      select: { youtubeVideoId: true, recordingId: true, meeting: true },
    });
    const byVideo = new Map(syncLogs.map((l) => [l.youtubeVideoId, l]));

    const fetchedAt = updated?.channelVideosFetchedAt ?? null;
    return {
      lastFetchedAt: fetchedAt,
      stale:
        !fetchedAt || Date.now() - fetchedAt.getTime() > CHANNEL_VIDEOS_CACHE_TTL_MS,
      refreshError,
      videos: videos.map((v) => {
        const log = byVideo.get(v.videoId);
        return {
          videoId: v.videoId,
          title: v.title,
          thumbnail: v.thumbnail,
          privacyStatus: v.privacyStatus,
          durationSeconds: v.durationSeconds,
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          publishedAt: v.publishedAt,
          zoomSync: log
            ? { recordingId: log.recordingId, meeting: log.meeting }
            : null,
        };
      }),
    };
  }

  // Keeps the cached row in step after an edit from the UI; never throws
  private async updateChannelVideoCache(
    userId: string,
    videoId: string,
    data: { title?: string; privacyStatus?: string; thumbnail?: string },
  ) {
    try {
      await this.prisma.channelVideoCache.updateMany({
        where: { userId, videoId },
        data,
      });
    } catch (error) {
      this.logger.warn(`Failed to update channel video cache for ${videoId}: ${error.message}`);
    }
  }
}
