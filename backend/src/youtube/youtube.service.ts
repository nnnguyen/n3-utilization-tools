import { Injectable, Logger, BadRequestException, UnauthorizedException } from "@nestjs/common";
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
    let redirectUri = process.env.YOUTUBE_REDIRECT_URI;

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
    privacyStatus: "public" | "private" | "unlisted" = "unlisted",
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
    privacyStatus: "public" | "private" | "unlisted" = "unlisted",
    userId: string = "system",
  ) {
    try {
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

      const res = await youtube.videos.insert({
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
      });

      this.logger.log(`Video uploaded successfully: ${res.data.id}`);
      return res.data;
    } catch (error) {
      this.logger.error("Error uploading video to YouTube", error.stack);
      throw new BadRequestException(
        `Failed to upload video to YouTube: ${error.message}`,
      );
    }
  }
}
