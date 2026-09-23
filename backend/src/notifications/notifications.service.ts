import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateNotificationInput {
  userId: string;
  type: "sync_completed" | "sync_failed";
  title: string;
  message: string;
  link?: string | null;
  recordingId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Never throws: a notification failure must not break the sync flow.
  async create(input: CreateNotificationInput) {
    if (!input.userId || input.userId === "system") return null;
    try {
      return await this.prisma.notification.create({ data: input });
    } catch (error) {
      this.logger.error(
        `Failed to create notification for user ${input.userId}: ${error.message}`,
      );
      return null;
    }
  }

  async list(userId: string, limit = 20) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }
}
