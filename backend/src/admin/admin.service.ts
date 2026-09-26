import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { codedError } from "../common/coded-error";
import {
  generateTempPassword,
  removesLastSuperAdmin,
  SUPER_ADMIN,
  tempPasswordExpiry,
} from "./account-rules";
import { CreateAccountDto, ResetTempPasswordDto, UpdateAccountDto } from "./admin.dto";

// What the admin pages see of an account: never a password or a token
function toAdminAccount(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    hasPassword: !!user.password,
    hasGoogle: !!user.googleId,
    isEmailVerified: user.isEmailVerified,
    platformRole: user.platformRole,
    isLocked: user.isLocked,
    mustChangePassword: user.mustChangePassword,
    tempPasswordExpiresAt: user.tempPasswordExpiresAt,
    createdAt: user.createdAt,
  };
}

// System administration by super admins (docs/design/P2-2-workspaces.md §6b)
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async listAccounts(search?: string) {
    const query = search?.trim();
    const users = await this.prisma.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return users.map(toAdminAccount);
  }

  /** Creates an account with a generated temp password, returned once. */
  async createAccount(actorId: string, dto: CreateAccountDto) {
    const email = dto.email.trim();
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      throw codedError(ConflictException, "AUTH_EMAIL_EXISTS", "Email đã tồn tại");
    }
    const tempPassword = generateTempPassword();
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name?.trim() || null,
        password: await bcrypt.hash(tempPassword, 10),
        isEmailVerified: dto.isEmailVerified ?? true,
        mustChangePassword: dto.mustChangePassword ?? true,
        tempPasswordExpiresAt: tempPasswordExpiry(),
      },
    });
    await this.activity.record({
      actorId,
      action: "admin.user.created",
      targetType: "user",
      targetId: user.id,
      data: {
        email,
        isEmailVerified: user.isEmailVerified,
        mustChangePassword: user.mustChangePassword,
      },
    });
    return { account: toAdminAccount(user), tempPassword };
  }

  async updateAccount(actorId: string, id: string, dto: UpdateAccountDto) {
    const user = await this.find(id);
    if (id === actorId && (dto.isLocked || dto.platformRole === "user")) {
      throw codedError(
        BadRequestException,
        "ADMIN_CANNOT_TARGET_SELF",
        "Không thể khoá hoặc gỡ quyền của chính mình",
      );
    }
    if (dto.isLocked || dto.platformRole === "user") {
      await this.assertNotLastSuperAdmin(user);
    }

    const updated = await this.prisma.user.update({ where: { id }, data: dto });
    const changes: [keyof UpdateAccountDto, string, string][] = [
      ["isEmailVerified", "admin.user.verified", "admin.user.unverified"],
      ["isLocked", "admin.user.locked", "admin.user.unlocked"],
    ];
    for (const [field, on, off] of changes) {
      if (dto[field] !== undefined && dto[field] !== user[field]) {
        await this.record(actorId, dto[field] ? on : off, updated);
      }
    }
    if (dto.platformRole && dto.platformRole !== user.platformRole) {
      await this.record(
        actorId,
        dto.platformRole === SUPER_ADMIN ? "admin.super_admin.granted" : "admin.super_admin.revoked",
        updated,
      );
    }
    return toAdminAccount(updated);
  }

  /** Replaces the password with a new temp one (the old one stops working). */
  async resetTempPassword(actorId: string, id: string, dto: ResetTempPasswordDto) {
    await this.find(id);
    const tempPassword = generateTempPassword();
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: dto.mustChangePassword ?? true,
        tempPasswordExpiresAt: tempPasswordExpiry(),
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
    await this.record(actorId, "admin.user.temp_password_reset", updated, {
      mustChangePassword: updated.mustChangePassword,
    });
    return { account: toAdminAccount(updated), tempPassword };
  }

  async deleteAccount(actorId: string, id: string) {
    const user = await this.find(id);
    if (id === actorId) {
      throw codedError(
        BadRequestException,
        "ADMIN_CANNOT_TARGET_SELF",
        "Không thể xoá chính mình",
      );
    }
    await this.assertNotLastSuperAdmin(user);
    await this.prisma.user.delete({ where: { id } });
    await this.record(actorId, "admin.user.deleted", user);
    return { success: true };
  }

  /** Latest activity, newest first (system-level entries for now). */
  async listActivity(limit = 100) {
    const entries = await this.prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
    });
    const actorIds = [...new Set(entries.map((e) => e.actorId).filter((id): id is string => !!id))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, name: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return entries.map((e) => ({ ...e, actor: e.actorId ? byId.get(e.actorId) ?? null : null }));
  }

  private async find(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw codedError(NotFoundException, "ADMIN_USER_NOT_FOUND", "Không tìm thấy tài khoản");
    }
    return user;
  }

  private async assertNotLastSuperAdmin(user: User) {
    const active = await this.prisma.user.count({
      where: { platformRole: SUPER_ADMIN, isLocked: false },
    });
    if (removesLastSuperAdmin(user, active)) {
      throw codedError(
        BadRequestException,
        "ADMIN_LAST_SUPER_ADMIN",
        "Không thể khoá, gỡ quyền hoặc xoá quản trị hệ thống cuối cùng",
      );
    }
  }

  private record(actorId: string, action: string, user: User, data?: Record<string, unknown>) {
    return this.activity.record({
      actorId,
      action,
      targetType: "user",
      targetId: user.id,
      data: { email: user.email, ...data },
    });
  }
}
