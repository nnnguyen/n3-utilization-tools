import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { YoutubeService } from "../youtube/youtube.service";
import * as fs from "fs";
import * as path from "path";
import { firstValueFrom } from "rxjs";

@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly youtubeService: YoutubeService,
  ) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt) {
      return this.accessToken;
    }

    this.logger.log("Fetching new Zoom access token");
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;

    if (!accountId || !clientId || !clientSecret) {
      throw new Error("Zoom API credentials are not fully configured");
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
      this.accessToken = token;
      // Expire 1 minute early to be safe
      this.tokenExpiresAt = now + (response.data.expires_in - 60) * 1000;
      return token;
    } catch (error) {
      this.logger.error(
        "Error fetching Zoom access token",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async listRecordings(userId: string = "me") {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.zoom.us/v2/users/${userId}/recordings`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        "Error listing Zoom recordings",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async handleRecordingCompleted(payload: any) {
    const { recording_files, topic, start_time } = payload.object;

    // Find the MP4 file
    const videoFile = recording_files.find((file) => file.file_type === "MP4");

    if (!videoFile) {
      this.logger.warn("No MP4 file found in Zoom recording");
      return;
    }

    const downloadUrl = videoFile.download_url;
    const downloadToken = payload.download_token;

    // Create local path for temporary storage
    const tempDir = path.join(process.cwd(), "uploads", "zoom");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `${topic}_${start_time}.mp4`.replace(
      /[/\\?%*:|"<>]/g,
      "-",
    );
    const filePath = path.join(tempDir, fileName);

    try {
      this.logger.log(`Downloading Zoom recording from ${downloadUrl}`);

      // Download recording
      const response = await firstValueFrom(
        this.httpService.get(downloadUrl, {
          params: { access_token: downloadToken },
          responseType: "stream",
        }),
      );

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", () => resolve());
        writer.on("error", reject);
      });

      this.logger.log(`Downloaded Zoom recording to ${filePath}`);

      // Upload to YouTube
      const youtubeResult = await this.youtubeService.uploadVideo(
        filePath,
        `Zoom Recording: ${topic}`,
        `Recorded on ${start_time}`,
        "unlisted",
      );

      // Cleanup
      fs.unlinkSync(filePath);

      return youtubeResult;
    } catch (error) {
      this.logger.error("Failed to process Zoom recording", error.stack);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  }
}
