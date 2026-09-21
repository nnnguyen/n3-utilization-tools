import { Injectable, Logger } from "@nestjs/common";
import { google } from "googleapis";
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

  private getOAuthClient() {
    return new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );
  }

  // Real connection check, not just "are the env vars set": a refresh token
  // can be present but revoked or expired, so this calls channels.list(mine)
  // to confirm it still authenticates against a real channel.
  async getConnectionStatus(): Promise<YoutubeConnectionStatus> {
    const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } =
      process.env;

    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
      return { connected: false, reason: "not_configured" };
    }

    try {
      const oauth2Client = this.getOAuthClient();
      oauth2Client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });

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
        `YouTube connection check failed: ${error.message ?? error}`,
      );
      return { connected: false, reason: "invalid_credentials" };
    }
  }

  async uploadVideo(
    filePath: string,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "unlisted",
  ) {
    try {
      const oauth2Client = this.getOAuthClient();
      oauth2Client.setCredentials({
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      });

      const youtube = google.youtube({
        version: "v3",
        auth: oauth2Client,
      });

      const fileSize = fs.statSync(filePath).size;

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
            body: fs.createReadStream(filePath),
          },
        },
        {
          onUploadProgress: (evt) => {
            const progress = (evt.bytesRead / fileSize) * 100;
            this.logger.log(`Upload progress: ${Math.round(progress)}%`);
          },
        },
      );

      this.logger.log(`Video uploaded successfully: ${res.data.id}`);
      return res.data;
    } catch (error) {
      this.logger.error("Error uploading video to YouTube", error.stack);
      throw error;
    }
  }
}
