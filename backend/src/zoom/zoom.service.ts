import { Injectable, Logger, BadRequestException, UnauthorizedException } from "@nestjs/common";
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

    if (!accountId || !clientId || !clientSecret || clientSecret === "REPLACE_WITH_REAL_SECRET") {
      throw new BadRequestException("Zoom API credentials are not fully configured");
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
        throw new UnauthorizedException("Failed to obtain access token from Zoom");
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

      // Filter: only show recordings not yet synced to Youtube
      // We check our ZoomSyncLog for successful syncs
      const syncedRecordings = await this.prisma.zoomSyncLog.findMany({
        where: {
          userId,
          status: "Success",
          recordingId: { not: null },
        },
        select: { recordingId: true },
      });

      const syncedIds = new Set(
        syncedRecordings.map((log) => log.recordingId as string),
      );

      if (data.meetings) {
        data.meetings = data.meetings.filter(
          (meeting) =>
            !syncedIds.has(meeting.uuid) &&
            !syncedIds.has(meeting.id.toString()),
        );
      }

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

  async getSyncLogs(userId: string) {
    return this.prisma.zoomSyncLog.findMany({
      where: {
        userId,
        status: "Success",
        youtubeId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async handleRecordingCompleted(payload: any) {
    const { recording_files, topic, start_time, uuid, id } = payload.object;
    const recordingId = uuid || id?.toString();

    // Find the shared_screen_with_speaker_view MP4 file
    const videoFile = recording_files.find(
      (file) =>
        file.file_type === "MP4" &&
        file.recording_type === "shared_screen_with_speaker_view",
    );

    if (!videoFile) {
      this.logger.warn(
        `No shared_screen_with_speaker_view MP4 file found in Zoom recording ${recordingId}`,
      );
      return;
    }

    const downloadUrl = videoFile.download_url;
    const downloadToken = payload.download_token;
    const userId = payload.userId || "system";

    try {
      this.logger.log(`Processing Zoom recording sync for ${topic}`);

      // We only store the download URL, don't download and store the file locally anymore
      // However, to upload to YouTube, we still need a readable stream or path.
      // The requirement says: "We only store the file in database with download_url, don't download the store the file"
      // This likely means we shouldn't keep it permanently, but for uploading to YouTube we might still need a temp download.
      // BUT if I interpret it strictly, maybe they want to avoid local storage entirely.
      // YouTube API requires a stream. We can pipe from Zoom to YouTube directly.

      // Upload to YouTube by streaming directly from Zoom
      const youtubeResult = await this.uploadToYoutubeDirectly(
        downloadUrl,
        downloadToken,
        topic,
        start_time,
        userId,
      );

      // Log success
      if (userId !== "system" && youtubeResult) {
        await this.prisma.zoomSyncLog.upsert({
          where: { recordingId },
          update: {
            status: "Success",
            youtubeId: youtubeResult.id,
            downloadUrl,
          },
          create: {
            userId,
            event: "Recording Completed",
            meeting: topic,
            status: "Success",
            youtubeId: youtubeResult.id,
            downloadUrl,
            recordingId,
          },
        });
      }

      return youtubeResult;
    } catch (error) {
      this.logger.error("Failed to process Zoom recording", error.stack);

      // Log failure
      if (userId !== "system") {
        await this.prisma.zoomSyncLog.upsert({
          where: { recordingId },
          update: {
            status: "Failed",
            downloadUrl,
          },
          create: {
            userId,
            event: "Recording Completed",
            meeting: topic,
            status: "Failed",
            downloadUrl,
            recordingId,
          },
        });
      }
      throw error;
    }
  }

  private async uploadToYoutubeDirectly(
    downloadUrl: string,
    downloadToken: string,
    topic: string,
    startTime: string,
    userId: string,
  ) {
    const response = await firstValueFrom(
      this.httpService.get(downloadUrl, {
        params: { access_token: downloadToken },
        responseType: "stream",
      }),
    );

    // We need to pass the stream to YoutubeService.
    // I need to modify YoutubeService.uploadVideo to accept a stream.
    return this.youtubeService.uploadVideoFromStream(
      response.data,
      `Zoom Recording: ${topic}`,
      `Recorded on ${startTime}`,
      "unlisted",
      userId,
    );
  }
}
