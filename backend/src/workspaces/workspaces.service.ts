import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
    });

    await this.activity.record({
      actorId: userId,
      workspaceId: workspace.id,
      action: 'workspace.created',
      data: { name: workspace.name },
    });

    return workspace;
  }

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });
  }

  async findOne(workspaceId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { workspaceId, userId },
      include: { workspace: true },
    });

    if (!membership) {
      throw new NotFoundException('Không tìm thấy Workspace hoặc bạn không có quyền.');
    }

    return membership.workspace;
  }

  async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    const membership = await this.prisma.membership.findFirst({
      where: { workspaceId, userId, role: 'OWNER' },
    });

    if (!membership) {
      throw new ForbiddenException('Chỉ OWNER mới có quyền cập nhật Workspace.');
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: dto,
    });

    await this.activity.record({
      actorId: userId,
      workspaceId,
      action: 'workspace.updated',
      data: dto,
    });

    return updated;
  }

  async switchWorkspace(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, workspaceId },
    });

    if (!membership) {
      throw new ForbiddenException('Bạn không thuộc Workspace này.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { activeWorkspaceId: workspaceId },
    });

    await this.activity.record({
      actorId: userId,
      workspaceId,
      action: 'workspace.switched',
    });

    return { success: true };
  }

  async listActivity(workspaceId: string, userId: string, limit = 50) {
    const membership = await this.prisma.membership.findFirst({
      where: { workspaceId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('Bạn không thuộc Workspace này.');
    }

    const entries = await this.prisma.activityLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        workspace: { select: { name: true } }
      }
    });

    const actorIds = [...new Set(entries.map((e) => e.actorId).filter((id): id is string => !!id))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));

    return entries.map((e) => ({
      ...e,
      actor: e.actorId ? byId.get(e.actorId) ?? null : null,
    }));
  }

  /**
   * Finds users who are using the same Zoom account but are not in this workspace.
   * This helps identify potential workspace consolidation.
   */
  async getZoomConsolidationSuggestions(workspaceId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { workspaceId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('Bạn không thuộc Workspace này.');
    }

    // 1. Get current Zoom connections in this workspace
    const workspaceZoomConnections = await this.prisma.connection.findMany({
      where: { workspaceId, provider: 'zoom', status: 'active' },
      select: { externalAccountId: true },
    });

    const accountIds = workspaceZoomConnections
      .map((c) => c.externalAccountId)
      .filter((id): id is string => !!id);

    if (accountIds.length === 0) return [];

    // 2. Find other users with these same Zoom accounts who are NOT members of this workspace
    const otherConnections = await this.prisma.connection.findMany({
      where: {
        provider: 'zoom',
        externalAccountId: { in: accountIds },
        userId: { not: userId }, // Not current user
        workspace: {
          members: {
            none: { userId } // Current user is not in their workspace
          }
        },
        OR: [
          { workspaceId: { not: workspaceId } },
          { workspaceId: null }
        ]
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true }
        }
      }
    });

    // 3. Filter out users who are already in this workspace via other means
    const existingMembers = await this.prisma.membership.findMany({
      where: { workspaceId },
      select: { userId: true }
    });
    const memberUserIds = new Set(existingMembers.map(m => m.userId));

    return otherConnections
      .filter(c => !memberUserIds.has(c.userId))
      .map(c => ({
        userId: c.user.id,
        email: c.user.email,
        name: c.user.name,
        avatarUrl: c.user.avatarUrl,
        zoomAccountId: c.externalAccountId,
        zoomAccountName: c.externalAccountName
      }));
  }
}
