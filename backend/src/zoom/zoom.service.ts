import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { YoutubeService } from "../youtube/youtube.service";
import { PrismaService } from "../prisma/prisma.service";
import * as fs from "fs";
import * as path from "path";
import { firstValueFrom } from "rxjs";

@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);
  private accessTokens: Map<string, { token: string; expiresAt: number }> =
    new Map();

  constructor(
    private readonly httpService: HttpService,
    private readonly youtubeService: YoutubeService,
    private readonly prisma: PrismaService,
  ) {}

  private async isZoomConfigured(userId: string): Promise<boolean> {
    const config = await this.prisma.zoomConfig.findUnique({
      where: { userId },
    });

    if (!config || !config.isActive) return false;

    const accountId = config.accountId || process.env.ZOOM_ACCOUNT_ID;
    const clientId = config.clientId || process.env.ZOOM_CLIENT_ID;
    const clientSecret = config.clientSecret || process.env.ZOOM_CLIENT_SECRET;

    if (
      !accountId ||
      !clientId ||
      !clientSecret ||
      clientSecret === "REPLACE_WITH_REAL_SECRET"
    ) {
      return false;
    }

    return true;
  }

  private async getAccessToken(userId: string): Promise<string> {
    const cached = this.accessTokens.get(userId);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return cached.token;
    }

    this.logger.log(`Fetching new Zoom access token for user ${userId}`);
    const config = await this.prisma.zoomConfig.findUnique({
      where: { userId },
    });

    const accountId = config?.accountId || process.env.ZOOM_ACCOUNT_ID;
    const clientId = config?.clientId || process.env.ZOOM_CLIENT_ID;
    const clientSecret = config?.clientSecret || process.env.ZOOM_CLIENT_SECRET;

    if (
      !accountId ||
      !clientId ||
      !clientSecret ||
      clientSecret === "REPLACE_WITH_REAL_SECRET"
    ) {
      throw new BadRequestException(
        "Zoom API credentials are not fully configured",
      );
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
          {},
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          },
        ),
      );

      const token = response.data.access_token;
      if (!token) {
        throw new UnauthorizedException(
          "Failed to obtain access token from Zoom",
        );
      }

      this.accessTokens.set(userId, {
        token,
        expiresAt: now + (response.data.expires_in - 60) * 1000,
      });

      return token;
    } catch (error) {
      this.logger.error(
        `Error fetching Zoom access token for user ${userId}`,
        error.response?.data || error.message,
      );
      throw new UnauthorizedException(
        `Zoom Authentication Failed: ${error.response?.data?.reason || error.response?.data?.error_description || error.message}`,
      );
    }
  }

  async listRecordings(
    userId: string,
    params: {
      page_size?: number;
      next_page_token?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    // Check if Zoom is configured and active for this user
    const isConfigured = await this.isZoomConfigured(userId);
    if (!isConfigured) {
      this.logger.debug(
        `Zoom is not configured or active for user ${userId}, skipping API call`,
      );
      return { meetings: [] };
    }

    const token = await this.getAccessToken(userId);
    try {
      const queryParams = new URLSearchParams();
      if (params.page_size)
        queryParams.append("page_size", params.page_size.toString());
      if (params.next_page_token)
        queryParams.append("next_page_token", params.next_page_token);
      if (params.from) queryParams.append("from", params.from);
      if (params.to) queryParams.append("to", params.to);

      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.zoom.us/v2/users/me/recordings?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );

      const data = response.data;

      return data;
    } catch (error) {
      this.logger.error(
        "Error listing Zoom recordings",
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        `Failed to list Zoom recordings: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async getSyncLogs(userId: string, recordingId?: string) {
    return this.prisma.zoomSyncLog.findMany({
      where: {
        userId,
        ...(recordingId ? { recordingId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async handleRecordingCompleted(payload: any) {
    const { recording_files, topic, start_time, uuid, id } = payload.object;
    const recordingId = uuid || id?.toString();
    const downloadToken = payload.download_token;
    const userId = payload.userId || "system";

    return this.processRecordingSync(
      recordingId,
      recording_files,
      topic,
      start_time,
      userId,
      downloadToken,
    );
  }

  async syncRecording(
    userId: string,
    recordingId: string,
    topic: string,
    startTime: string,
    privacyStatus?: "public" | "private" | "unlisted",
    playlistId?: string,
  ) {
    const token = await this.getAccessToken(userId);
    try {
      const encodedRecordingId =
        recordingId.includes("/") || recordingId.includes("//")
          ? encodeURIComponent(encodeURIComponent(recordingId))
          : recordingId;

      this.logger.log(
        `Fetching recording details for sync: ${recordingId} (encoded: ${encodedRecordingId})`,
      );
      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.zoom.us/v2/meetings/${encodedRecordingId}/recordings`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );

      const { recording_files } = response.data;
      if (!recording_files || recording_files.length === 0) {
        throw new Error("No recording files found for this meeting.");
      }

      return this.processRecordingSync(
        recordingId,
        recording_files,
        topic,
        startTime,
        userId,
        undefined,
        privacyStatus,
        playlistId,
      );
    } catch (error) {
      this.logger.error(
        `Error fetching recording details for sync: ${recordingId}`,
        error.response?.data || error.message,
      );
      const zoomErrorMessage = error.response?.data?.message || error.message;
      throw new BadRequestException(
        `Failed to fetch recording details from Zoom: ${zoomErrorMessage}`,
      );
    }
  }

  private async processRecordingSync(
    recordingId: string,
    recordingFiles: any[],
    topic: string,
    startTime: string,
    userId: string,
    downloadToken?: string,
    privacyStatus?: "public" | "private" | "unlisted",
    playlistId?: string,
  ) {
    // Find the shared_screen_with_speaker_view MP4 file
    const videoFile = recordingFiles.find(
      (file) =>
        file.file_type === "MP4" &&
        (file.recording_type === "shared_screen_with_speaker_view" ||
          file.recording_type === "host_video" || // Fallback if requested type not found
          true), // Or just the first MP4 if we want to be generous
    );

    // Filter strictly if possible, but let's be more robust
    const bestVideoFile =
      recordingFiles.find(
        (f) =>
          f.file_type === "MP4" &&
          f.recording_type === "shared_screen_with_speaker_view",
      ) || recordingFiles.find((f) => f.file_type === "MP4");

    if (!bestVideoFile) {
      this.logger.warn(
        `No suitable MP4 file found in Zoom recording ${recordingId}. Available files: ${JSON.stringify(recordingFiles.map((f) => ({ type: f.file_type, rec_type: f.recording_type })))}`,
      );
      throw new BadRequestException(
        "No suitable MP4 file found in this recording.",
      );
    }

    const downloadUrl = bestVideoFile.download_url;
    const fileSize = bestVideoFile.file_size;

    try {
      this.logger.log(
        `Processing Zoom recording sync for ${topic} (${recordingId})`,
      );

      // Reset or create log entry for this sync attempt
      // We only create a NEW log if the previous one was SUCCESS or FAILED
      const existingLog = await this.prisma.zoomSyncLog.findUnique({
        where: { recordingId },
      });

      const shouldCreateNew =
        !existingLog ||
        existingLog.syncStatus === "COMPLETED" ||
        existingLog.syncStatus === "FAILED";

      if (userId !== "system") {
        await this.prisma.zoomSyncLog.upsert({
          where: { recordingId },
          update: {
            status: "Processing",
            syncStatus: "UPLOADING",
            progress: 0,
            downloadUrl,
            syncStartedAt: new Date(),
            syncCompletedAt: null,
            syncError: null,
            errorSource: null,
            errorCode: null,
            errorMessage: null,
            youtubeProcessingStatus: null,
          },
          create: {
            userId,
            event: "Manual Sync" + (downloadToken ? " (Webhook)" : ""),
            meeting: topic,
            status: "Processing",
            syncStatus: "UPLOADING",
            progress: 0,
            downloadUrl,
            recordingId,
            syncStartedAt: new Date(),
          },
        });
      }

      // Upload to YouTube by streaming directly from Zoom
      const youtubeResult = await this.uploadToYoutubeDirectly(
        downloadUrl,
        downloadToken,
        topic,
        startTime,
        userId,
        recordingId,
        fileSize,
        privacyStatus,
        playlistId,
      );

      return youtubeResult;
    } catch (error) {
      this.logger.error(
        `Failed to process Zoom recording ${recordingId}`,
        error.stack,
      );

      // Log failure if not already handled by youtubeService
      if (userId !== "system") {
        const existingLog = await this.prisma.zoomSyncLog.findUnique({
          where: { recordingId },
        });

        if (existingLog && existingLog.syncStatus !== "FAILED") {
          await this.prisma.zoomSyncLog.update({
            where: { recordingId },
            data: {
              status: "Failed",
              syncStatus: "FAILED",
              syncError: error.message,
              errorMessage: error.message,
              errorSource: "upload",
            },
          });
        }
      }
      throw error;
    }
  }

  private async uploadToYoutubeDirectly(
    downloadUrl: string,
    downloadToken: string | undefined,
    topic: string,
    startTime: string,
    userId: string,
    recordingId: string,
    fileSize?: number,
    privacyStatus?: "public" | "private" | "unlisted",
    playlistId?: string,
  ) {
    const headers: any = {};
    const params: any = {};

    if (downloadToken) {
      params.access_token = downloadToken;
    } else {
      // If no download token, we must use the user's OAuth access token
      const token = await this.getAccessToken(userId);
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(downloadUrl, {
        params,
        headers,
        responseType: "stream",
      }),
    );

    const stream = response.data;
    if (fileSize) {
      stream.length = fileSize;
    }

    let lastProgress = 0;
    const onProgress = async (progress: number) => {
      // Only update DB every 5% to avoid too many writes
      if (progress >= lastProgress + 5 || progress === 100) {
        lastProgress = progress;
        if (userId !== "system") {
          try {
            await this.prisma.zoomSyncLog.update({
              where: { recordingId },
              data: { progress },
            });
          } catch (e) {
            // Ignore DB update errors during progress
          }
        }
      }
    };

    return this.youtubeService.uploadVideoFromStream(
      stream,
      `Zoom Recording: ${topic}`,
      `Recorded on ${startTime}`,
      privacyStatus || "private",
      userId,
      onProgress,
      recordingId,
      playlistId,
    );
  }
}
