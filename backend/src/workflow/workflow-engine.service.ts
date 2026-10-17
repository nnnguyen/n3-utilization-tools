import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { YoutubeService } from '../youtube/youtube.service';
import { DriveBackupService } from '../zoom/drive-backup.service';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly youtubeService: YoutubeService,
    @Inject(forwardRef(() => DriveBackupService))
    private readonly driveBackupService: DriveBackupService,
  ) {}

  async executeRecordingWorkflow(recordingId: string, workspaceId: string) {
    const log = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId },
    });

    if (!log) {
      this.logger.error(`No sync log found for recording ${recordingId}`);
      return;
    }

    const settings = await this.prisma.zoomWorkflowSettings.findUnique({
      where: { workspaceId },
    });

    if (!settings) return;

    // AI Enrichment
    if (settings.aiTitleEnabled || settings.aiSummaryEnabled || settings.aiChaptersEnabled) {
      await this.runAIEnrichment(log, settings);
    }

    // Chapters update if YouTube upload was successful
    if (settings.aiChaptersEnabled && (log.syncStatus === 'COMPLETED' || log.syncStatus === 'PROCESSING') && log.youtubeVideoId) {
      await this.applyAIChapters(log);
    }
  }

  private async runAIEnrichment(log: any, settings: any) {
    const transcript = log.transcriptText;
    if (!transcript) return;

    const updates: any = {};

    if (settings.aiTitleEnabled && !log.aiTitle) {
      updates.aiTitle = await this.aiService.generateTitle(log.topic, transcript);
    }

    if (settings.aiSummaryEnabled && !log.aiSummary) {
      updates.aiSummary = await this.aiService.generateSummary(log.topic, transcript);
    }

    if (settings.aiChaptersEnabled && !log.aiChapters) {
      updates.aiChapters = await this.aiService.generateChapters(log.topic, transcript);
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.zoomSyncLog.update({
        where: { id: log.id },
        data: updates,
      });
    }
  }

  private async applyAIChapters(log: any) {
    if (!log.aiChapters || !log.youtubeVideoId) return;

    try {
      const description = `${log.aiSummary || ''}\n\nChapters:\n${log.aiChapters}`;
      
      await this.youtubeService.updateVideoMetadata(log.userId, log.youtubeVideoId, {
        title: log.aiTitle || log.topic,
        description,
      });

      this.logger.log(`Successfully applied AI Chapters to YouTube video ${log.youtubeVideoId}`);
    } catch (error) {
      this.logger.error(`Failed to apply AI chapters: ${error.message}`);
    }
  }
}
