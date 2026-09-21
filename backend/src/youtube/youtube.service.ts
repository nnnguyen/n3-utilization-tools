import { Injectable, Logger } from "@nestjs/common";
import { google } from "googleapis";
import * as fs from "fs";

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  async uploadVideo(
    filePath: string,
    title: string,
    description: string,
    privacyStatus: "public" | "private" | "unlisted" = "unlisted",
  ) {
    try {
      // Note: In a real application, you would need to handle OAuth2 tokens properly.
      // This implementation assumes you have the credentials/tokens set up in environment variables.

      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI,
      );

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
