import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const QUOTA_AVERAGE_DAYS = 30;
const TOP_FAILING_LIMIT = 10;

// Stats cover Zoom -> YouTube syncs (ZoomSyncLog). Manual uploads from the
// YouTube Utilities page are not logged there and are not included.
@Injectable()
export class YoutubeStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string, months = 6) {
    const monthsBack = Math.min(Math.max(months, 1), 24);
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

    const [
      completedAgg,
      statusCounts,
      attemptAgg,
      completedSince,
      topFailing,
      quotaRows,
    ] = await Promise.all([
      this.prisma.zoomSyncLog.aggregate({
        where: { userId, syncStatus: "COMPLETED" },
        _count: { _all: true },
        _sum: { fileSize: true, durationSeconds: true },
      }),
      this.prisma.zoomSyncLog.groupBy({
        by: ["syncStatus"],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.zoomSyncLog.aggregate({
        where: { userId },
        _sum: { attemptCount: true, failureCount: true },
      }),
      this.prisma.zoomSyncLog.findMany({
        where: {
          userId,
          syncStatus: "COMPLETED",
          syncCompletedAt: { gte: since },
        },
        select: { syncCompletedAt: true },
      }),
      this.prisma.zoomSyncLog.findMany({
        where: { userId, failureCount: { gt: 0 } },
        orderBy: [{ failureCount: "desc" }, { createdAt: "desc" }],
        take: TOP_FAILING_LIMIT,
        select: {
          recordingId: true,
          meeting: true,
          failureCount: true,
          attemptCount: true,
          syncStatus: true,
          syncError: true,
          syncStartedAt: true,
        },
      }),
      this.prisma.youtubeQuotaUsage.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: QUOTA_AVERAGE_DAYS,
        select: { unitsUsed: true },
      }),
    ]);

    // One bucket per month, oldest first, so empty months still show as 0
    const monthly: { month: string; completed: number }[] = [];
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
      monthly.push({ month: this.monthKey(d), completed: 0 });
    }
    const byMonth = new Map(monthly.map((m) => [m.month, m]));
    for (const log of completedSince) {
      if (!log.syncCompletedAt) continue;
      const bucket = byMonth.get(this.monthKey(log.syncCompletedAt));
      if (bucket) bucket.completed++;
    }

    const countOf = (status: string) =>
      statusCounts.find((s) => s.syncStatus === status)?._count._all ?? 0;
    const completed = countOf("COMPLETED");
    const failed = countOf("FAILED");
    const totalAttempts = attemptAgg._sum.attemptCount ?? 0;
    const totalFailures = attemptAgg._sum.failureCount ?? 0;

    const quotaDays = quotaRows.length;
    const quotaUsed = quotaRows.reduce((sum, r) => sum + r.unitsUsed, 0);

    return {
      monthly,
      totals: {
        completedVideos: completedAgg._count._all,
        // BigInt is not JSON-serializable; byte totals stay well below 2^53
        totalBytes: Number(completedAgg._sum.fileSize ?? 0),
        totalDurationSeconds: completedAgg._sum.durationSeconds ?? 0,
      },
      rates: {
        completed,
        failed,
        inProgress:
          countOf("UPLOADING") + countOf("PROCESSING") + countOf("PENDING"),
        // Share of recordings whose latest sync succeeded
        successRate:
          completed + failed > 0 ? completed / (completed + failed) : null,
        totalAttempts,
        totalFailures,
        // Share of all attempts (incl. retries) that failed
        attemptFailureRate:
          totalAttempts > 0 ? totalFailures / totalAttempts : null,
      },
      quota: {
        averageUnitsPerDay: quotaDays > 0 ? Math.round(quotaUsed / quotaDays) : 0,
        daysSampled: quotaDays,
      },
      topFailing,
    };
  }

  private monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
}
