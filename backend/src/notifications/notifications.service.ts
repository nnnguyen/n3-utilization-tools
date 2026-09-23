import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // Never throws: a notification failure must not break the sync flow.
  async create(input: CreateNotificationInput) {
    if (!input.userId || input.userId === "system") return null;
    try {
      const notification = await this.prisma.notification.create({
        data: input,
      });
      // Not awaited: SMTP can be slow and must not hold up the sync flow
      void this.sendEmailCopy(input);
      return notification;
    } catch (error) {
      this.logger.error(
        `Failed to create notification for user ${input.userId}: ${error.message}`,
      );
      return null;
    }
  }

  private async sendEmailCopy(input: CreateNotificationInput) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          email: true,
          name: true,
          notifyEmailOnCompleted: true,
          notifyEmailOnFailed: true,
        },
      });
      if (!user?.email) return;
      const wanted =
        input.type === "sync_completed"
          ? user.notifyEmailOnCompleted
          : user.notifyEmailOnFailed;
      if (!wanted) return;

      await this.mailService.sendNotificationEmail(user.email, user.name, input);
    } catch (error) {
      this.logger.error(
        `Failed to send notification email to user ${input.userId}: ${error.message}`,
      );
    }
  }

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifyEmailOnCompleted: true, notifyEmailOnFailed: true },
    });
    return {
      notifyEmailOnCompleted: user?.notifyEmailOnCompleted ?? true,
      notifyEmailOnFailed: user?.notifyEmailOnFailed ?? true,
      // Lets the UI explain why no email arrives when SMTP is not set up
      emailConfigured: !!(process.env.MAIL_USER && process.env.MAIL_PASS),
    };
  }

  async updatePreferences(
    userId: string,
    prefs: { notifyEmailOnCompleted?: boolean; notifyEmailOnFailed?: boolean },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: prefs,
    });
    return this.getPreferences(userId);
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
