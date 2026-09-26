import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateSyncRuleDto,
  UpdateSyncRuleDto,
} from "./sync-rules.dto";

// Topic rules of the Automation Workflow (applied in ZoomService via sync-rules.ts)
@Injectable()
export class ZoomSyncRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.zoomSyncRule.findMany({
      where: { userId },
      orderBy: { position: "asc" },
    });
  }

  async create(userId: string, dto: CreateSyncRuleDto) {
    const last = await this.prisma.zoomSyncRule.findFirst({
      where: { userId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return this.prisma.zoomSyncRule.create({
      data: {
        ...this.toData(dto),
        matchText: dto.matchText.trim(),
        userId,
        position: (last?.position ?? -1) + 1,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSyncRuleDto) {
    await this.findOwned(userId, id);
    return this.prisma.zoomSyncRule.update({
      where: { id },
      data: this.toData(dto),
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.zoomSyncRule.delete({ where: { id } });
    return { success: true };
  }

  // ids: every rule of the user, in the new order
  async reorder(userId: string, ids: string[]) {
    const rules = await this.list(userId);
    const known = new Set(rules.map((r) => r.id));
    if (
      ids.length !== rules.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw new BadRequestException("ids must list every rule exactly once");
    }
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.zoomSyncRule.update({ where: { id }, data: { position } }),
      ),
    );
    return this.list(userId);
  }

  private async findOwned(userId: string, id: string) {
    const rule = await this.prisma.zoomSyncRule.findFirst({
      where: { id, userId },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    return rule;
  }

  // Empty strings clear optional fields; tags are trimmed and de-duplicated
  private toData(dto: UpdateSyncRuleDto) {
    const data: Record<string, unknown> = {};
    if (dto.matchText !== undefined) data.matchText = dto.matchText.trim();
    if (dto.titleTemplate !== undefined)
      data.titleTemplate = dto.titleTemplate?.trim() || null;
    if (dto.descriptionTemplate !== undefined)
      data.descriptionTemplate = dto.descriptionTemplate ?? null;
    if (dto.playlistId !== undefined) data.playlistId = dto.playlistId || null;
    if (dto.privacyStatus !== undefined)
      data.privacyStatus = dto.privacyStatus || null;
    if (dto.publishDelayMinutes !== undefined)
      data.publishDelayMinutes = dto.publishDelayMinutes ?? null;
    if (dto.captionLanguage !== undefined)
      data.captionLanguage = dto.captionLanguage || null;
    if (dto.tags !== undefined)
      data.tags = [...new Set(dto.tags.map((t) => t.trim()).filter(Boolean))];
    return data;
  }
}
