import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { getProvider, ProviderId } from "./providers";
import { quotaDate } from "./token-health";

// API quota per account and app, generalised from YoutubeService's
// trackQuotaUsage / getQuotaStatus (QuotaUsage replaces YoutubeQuotaUsage)
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Never throws: quota bookkeeping must not break the API call it follows.
  async track(userId: string, provider: ProviderId, units: number, now = new Date()) {
    const policy = getProvider(provider).quota;
    if (!policy || !userId || userId === "system") return;
    const date = quotaDate(now, policy.resetTimeZone);
    try {
      await this.prisma.quotaUsage.upsert({
        where: { userId_provider_date: { userId, provider, date } },
        update: { unitsUsed: { increment: units } },
        create: { userId, provider, date, unitsUsed: units },
      });
    } catch (error) {
      this.logger.error(
        `Failed to track ${provider} quota usage for user ${userId}: ${error.message}`,
      );
    }
  }

  /** Today's usage; null for providers without a quota. */
  async status(userId: string, provider: ProviderId, now = new Date()) {
    const policy = getProvider(provider).quota;
    if (!policy) return null;
    const date = quotaDate(now, policy.resetTimeZone);
    const usage = await this.prisma.quotaUsage.findUnique({
      where: { userId_provider_date: { userId, provider, date } },
    });
    const quotaLimit = policy.dailyLimit();
    const unitsUsed = usage?.unitsUsed ?? 0;
    return {
      unitsUsed,
      unitsRemaining: Math.max(0, quotaLimit - unitsUsed),
      quotaLimit,
      date,
    };
  }
}
