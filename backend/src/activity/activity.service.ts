import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface ActivityEntry {
  actorId: string | null; // null = the system
  action: string;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  // Never secrets or passwords
  data?: Record<string, unknown>;
}

// Activity log (docs/design/P2-2-workspaces.md): who did what
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Never throws: the logged action already happened
  async record(entry: ActivityEntry) {
    try {
      await this.prisma.activityLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          workspaceId: entry.workspaceId ?? null,
          targetType: entry.targetType,
          targetId: entry.targetId,
          data: entry.data as Prisma.InputJsonObject | undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to record activity ${entry.action}: ${error.message}`);
    }
  }
}
