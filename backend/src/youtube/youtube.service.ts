import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { google } from "googleapis";
import { PrismaService } from "../prisma/prisma.service";
import * as fs from "fs";

export interface YoutubeConnectionStatus {
  connected: boolean;
  reason?: "not_configured" | "invalid_credentials";
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string | null;
}

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  async getAuthUrl(userId: string): Promise<string> {
    const oauth2Client = await this.getOAuthClient(userId);

    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
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

    await this.prisma.youtubeConfig.upsert({
      where: { userId },
      update: {
        refreshToken: tokens.refresh_token ?? undefined,
        isActive: true,
      },
      create: {
        userId,
        refreshToken: tokens.refresh_token || "",
        isActive: true,
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
        part: ["snippet"],
        mine: true,
      });

      const channel = res.data.items?.[0];
      if (!channel) {
        return { connected: false, reason: "invalid_credentials" };
      }

      return {
        connected: true,
        channelId: channel.id ?? undefined,
        channelTitle: channel.snippet?.title ?? undefined,
        channelThumbnail: channel.snippet?.thumbnails?.default?.url ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `YouTube connection check failed for user ${userId}: ${error.message ?? error}`,
      );
      return { connected: false, reason: "invalid_credentials" };
    }
  }

  async uploadVideo(
    filePath: string,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "private",
    userId: string = "system",
  ) {
    return this.uploadVideoFromStream(
      fs.createReadStream(filePath),
      title,
      description,
      privacyStatus,
      userId,
    );
  }

  async uploadVideoFromStream(
    stream: any,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "private",
    userId: string = "system",
    onProgress?: (progress: number) => void,
    recordingId?: string,
  ) {
    try {
      if (recordingId) {
        try {
          await this.prisma.zoomSyncLog.update({
            where: { recordingId },
            data: {
              syncStatus: "UPLOADING",
              syncStartedAt: new Date(),
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
            },
            status: {
              privacyStatus,
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

      return res.data;
    } catch (error) {
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

      const video = res.data.items?.[0];
      if (!video) {
        throw new Error("Video not found on YouTube");
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
        const errorMapping =
          newSyncStatus === "FAILED"
            ? this.mapYoutubeError({
                message: syncError,
                code: video.status?.failureReason,
                response: {
                  data: {
                    error: {
                      errors: [{ reason: video.status?.failureReason }],
                    },
                  },
                },
              })
            : { errorMessage: syncError, errorCode: null };

        await this.prisma.zoomSyncLog.update({
          where: { recordingId },
          data: {
            syncStatus: newSyncStatus,
            youtubeProcessingStatus: processingStatus,
            syncCompletedAt,
            syncError: errorMapping.errorMessage,
            errorSource:
              newSyncStatus === "FAILED" ? "youtube_processing" : null,
            errorCode:
              errorMapping.errorCode || video.status?.failureReason || null,
            errorMessage: syncError,
          },
        });
      }

      return {
        syncStatus: newSyncStatus,
        uploadStatus,
        processingStatus,
        youtubeVideoId: videoId,
      };
    } catch (error) {
      this.logger.error(
        `Error checking YouTube video status for ${videoId}`,
        error.stack,
      );
      throw error;
    }
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
}
