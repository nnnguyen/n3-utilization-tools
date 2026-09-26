import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import { YoutubeService } from "../youtube/youtube.service";
import { findMatches, mp4Durations, MatchRecording } from "./youtube-match";

// Recordings that already have a video in progress or done can't be linked again
const ACTIVE_STATUSES = ["UPLOADING", "PROCESSING", "COMPLETED"] as const;

// Suggests, for Zoom recordings the app has no sync record of, the video of the
// user's channel they were probably uploaded as, and records the user's answer:
// a link (a COMPLETED sync log with source "linked") or a dismissal.
@Injectable()
export class ZoomYoutubeMatchService {
  private readonly logger = new Logger(ZoomYoutubeMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  // Adds `youtubeMatch` to the Zoom meetings (as listed by the Zoom API) that
  // have no sync record and match a channel video well enough
  async attachMatches(userId: string, meetings: any[]): Promise<any[]> {
    if (!meetings?.length) return meetings;

    const recordings: MatchRecording[] = meetings.map((m) => ({
      recordingId: m.uuid || String(m.id),
      topic: m.topic || "",
      startTime: m.start_time,
      durationsSeconds: mp4Durations(m.recording_files),
    }));
    // A recording has one sync record at most, whichever account made it
    // (several accounts can share a Zoom account): skip every tracked one
    const [ownLogs, recordingLogs] = await Promise.all([
      this.prisma.zoomSyncLog.findMany({
        where: { userId },
        select: { youtubeVideoId: true },
      }),
      this.prisma.zoomSyncLog.findMany({
        where: { recordingId: { in: recordings.map((r) => r.recordingId) } },
        select: { recordingId: true, userId: true, syncStatus: true },
      }),
    ]);
    const tracked = new Set(
      recordingLogs
        .filter((l) => l.userId !== userId || l.syncStatus !== "PENDING")
        .map((l) => l.recordingId),
    );
    const candidates = recordings.filter((r) => !tracked.has(r.recordingId));
    if (candidates.length === 0) return meetings;

    // The channel list is cached for an hour; refresh it if older. Without a
    // YouTube connection there is nothing to compare with.
    try {
      await this.youtubeService.getChannelVideos(userId);
    } catch (error) {
      this.logger.debug(`No channel videos to match for user ${userId}: ${error.message}`);
    }
    const [videos, dismissals] = await Promise.all([
      this.prisma.channelVideoCache.findMany({ where: { userId } }),
      this.prisma.zoomYoutubeMatchDismissal.findMany({
        where: { userId },
        select: { recordingId: true, videoId: true },
      }),
    ]);
    if (videos.length === 0) return meetings;

    const matches = findMatches(candidates, videos, {
      usedVideoIds: new Set(ownLogs.map((l) => l.youtubeVideoId).filter((v): v is string => !!v)),
      dismissed: new Set(dismissals.map((d) => `${d.recordingId}|${d.videoId}`)),
    });
    const byVideoId = new Map(videos.map((v) => [v.videoId, v]));

    return meetings.map((m) => {
      const match = matches.get(m.uuid || String(m.id));
      if (!match) return m;
      const v = byVideoId.get(match.video.videoId)!;
      return {
        ...m,
        youtubeMatch: {
          videoId: v.videoId,
          title: v.title,
          thumbnail: v.thumbnail,
          durationSeconds: v.durationSeconds,
          publishedAt: v.publishedAt,
          score: match.score,
          exact: match.exact,
        },
      };
    });
  }

  async link(
    userId: string,
    dto: { recordingId: string; videoId: string; topic: string; startTime: string; source?: string },
  ) {
    const existing = await this.prisma.zoomSyncLog.findUnique({
      where: { recordingId: dto.recordingId },
    });
    if (existing && existing.userId !== userId) {
      throw new BadRequestException("This recording is already tracked by another account");
    }
    if (existing && (ACTIVE_STATUSES as readonly string[]).includes(existing.syncStatus)) {
      throw new BadRequestException("This recording already has a YouTube video");
    }

    const video = await this.prisma.channelVideoCache.findUnique({
      where: { userId_videoId: { userId, videoId: dto.videoId } },
    });
    if (!video) {
      throw new BadRequestException("This video is not in your channel list; refresh the channel videos and try again");
    }
    const taken = await this.prisma.zoomSyncLog.findFirst({
      where: { userId, youtubeVideoId: dto.videoId, NOT: { recordingId: dto.recordingId } },
      select: { meeting: true },
    });
    if (taken) {
      throw new BadRequestException(`This video is already linked to the recording "${taken.meeting}"`);
    }

    const now = new Date();
    const linked = {
      event: "recording.linked",
      status: "Linked",
      syncStatus: "COMPLETED" as const,
      source: "linked",
      progress: 100,
      youtubeVideoId: video.videoId,
      youtubeId: video.videoId,
      youtubeProcessingStatus: "succeeded",
      recordingStartTime: dto.startTime,
      durationSeconds: video.durationSeconds,
      syncCompletedAt: now,
      syncError: null,
      errorSource: null,
      errorCode: null,
      errorMessage: null,
      nextRetryAt: null,
      autoRetryCount: 0,
    };
    const log = await this.prisma.zoomSyncLog.upsert({
      where: { recordingId: dto.recordingId },
      update: linked,
      create: {
        ...linked,
        userId,
        recordingId: dto.recordingId,
        meeting: dto.topic,
        syncStartedAt: now,
      },
    });
    this.analytics?.capture(userId, "recording_linked", { source: dto.source ?? null });
    return log;
  }

  // Undo a link (only links: an upload made by the app stays)
  async unlink(userId: string, recordingId: string) {
    const log = await this.prisma.zoomSyncLog.findUnique({ where: { recordingId } });
    if (!log || log.userId !== userId || log.source !== "linked") {
      throw new NotFoundException("No linked video for this recording");
    }
    await this.prisma.zoomSyncLog.delete({ where: { recordingId } });
    return { recordingId };
  }

  async dismiss(userId: string, recordingId: string, videoId: string) {
    await this.prisma.zoomYoutubeMatchDismissal.upsert({
      where: { userId_recordingId_videoId: { userId, recordingId, videoId } },
      update: {},
      create: { userId, recordingId, videoId },
    });
    return { recordingId, videoId };
  }
}
