import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { YoutubeService } from '../youtube/youtube.service';
import * as fs from 'fs';
import * as path from 'path';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly youtubeService: YoutubeService,
  ) {}

  async handleRecordingCompleted(payload: any) {
    const { recording_files, topic, start_time } = payload.object;
    
    // Find the MP4 file
    const videoFile = recording_files.find(file => file.file_type === 'MP4');
    
    if (!videoFile) {
      this.logger.warn('No MP4 file found in Zoom recording');
      return;
    }

    const downloadUrl = videoFile.download_url;
    const downloadToken = payload.download_token;
    
    // Create local path for temporary storage
    const tempDir = path.join(process.cwd(), 'uploads', 'zoom');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const fileName = `${topic}_${start_time}.mp4`.replace(/[/\\?%*:|"<>]/g, '-');
    const filePath = path.join(tempDir, fileName);

    try {
      this.logger.log(`Downloading Zoom recording from ${downloadUrl}`);
      
      // Download recording
      const response = await firstValueFrom(
        this.httpService.get(downloadUrl, {
          params: { access_token: downloadToken },
          responseType: 'stream',
        })
      );

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      this.logger.log(`Downloaded Zoom recording to ${filePath}`);

      // Upload to YouTube
      const youtubeResult = await this.youtubeService.uploadVideo(
        filePath,
        `Zoom Recording: ${topic}`,
        `Recorded on ${start_time}`,
        'unlisted'
      );

      // Cleanup
      fs.unlinkSync(filePath);
      
      return youtubeResult;
    } catch (error) {
      this.logger.error('Failed to process Zoom recording', error.stack);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  }
}
