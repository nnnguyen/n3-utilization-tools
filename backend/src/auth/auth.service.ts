import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { User } from "@prisma/client";
import { GoogleProfile } from "./strategies/google.strategy";
import { MailService } from "../mail/mail.service";
import { RegisterDto, LoginDto, ResetPasswordDto } from "./dto/auth-email.dto";
import { codedError } from "../common/coded-error";
import { ActivityService } from "../activity/activity.service";
import { passwordSignInBlock, SUPER_ADMIN } from "../admin/account-rules";
import { ChangePasswordDto } from "./dto/change-password.dto";

const SIGN_IN_BLOCK_MESSAGES = {
  AUTH_ACCOUNT_LOCKED: "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên",
  AUTH_TEMP_PASSWORD_EXPIRED:
    "Mật khẩu tạm đã hết hạn, vui lòng liên hệ quản trị viên để đặt lại",
};

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly activity: ActivityService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    // The account may already exist: promote it without waiting for a sign-in
    void this.bootstrapSuperAdmin();
  }

  /**
   * The first super admin: the account whose email is BOOTSTRAP_SUPER_ADMIN_EMAIL,
   * only while the system has no super admin at all. Returns the (maybe
   * promoted) user. Never throws.
   */
  async bootstrapSuperAdmin(user?: User): Promise<User | undefined> {
    const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) return user;
    try {
      if (user && user.email.toLowerCase() !== email) return user;
      const superAdmins = await this.prisma.user.count({
        where: { platformRole: SUPER_ADMIN },
      });
      if (superAdmins > 0) return user;
      const target =
        user ??
        (await this.prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        }));
      if (!target) return user;
      const promoted = await this.prisma.user.update({
        where: { id: target.id },
        data: { platformRole: SUPER_ADMIN },
      });
      this.logger.warn(`Bootstrapped the first super admin: ${promoted.email}`);
      await this.activity.record({
        actorId: null,
        action: "admin.super_admin.bootstrapped",
        targetType: "user",
        targetId: promoted.id,
        data: { email: promoted.email },
      });
      return promoted;
    } catch (error) {
      this.logger.error(`Super admin bootstrap failed: ${error.message}`);
      return user;
    }
  }

  async validateOAuthUser(profile: GoogleProfile): Promise<User> {
    const existing =
      (await this.prisma.user.findUnique({ where: { googleId: profile.googleId } })) ??
      (await this.prisma.user.findUnique({ where: { email: profile.email } }));
    if (existing?.isLocked) {
      throw codedError(
        UnauthorizedException,
        "AUTH_ACCOUNT_LOCKED",
        SIGN_IN_BLOCK_MESSAGES.AUTH_ACCOUNT_LOCKED,
      );
    }
    const user = await this.upsertOAuthUser(profile);
    return (await this.bootstrapSuperAdmin(user)) ?? user;
  }

  // Google proves the identity: a pending password change (an admin-made temp
  // password) no longer blocks this account; the temp password still expires
  private async upsertOAuthUser(profile: GoogleProfile): Promise<User> {
    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });
    if (byGoogleId) {
      return this.prisma.user.update({
        where: { id: byGoogleId.id },
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          isEmailVerified: true, // OAuth is verified
          mustChangePassword: false,
        },
      });
    }

    // Account may already exist from email/password registration with the
    // same email — link the Google identity to it instead of colliding on
    // the unique `email` constraint.
    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          name: byEmail.name ?? profile.name,
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          isEmailVerified: true,
          mustChangePassword: false,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        isEmailVerified: true,
      },
    });
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw codedError(ConflictException, "AUTH_EMAIL_EXISTS", "Email đã tồn tại");
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        verificationToken,
        isEmailVerified: false,
      },
    });

    await this.mailService.sendVerificationEmail(user.email, verificationToken);
    return {
      success: true,
      message: "Vui lòng kiểm tra email để xác thực tài khoản",
    };
  }

  async login(dto: LoginDto): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.password) {
      throw codedError(
        UnauthorizedException,
        "AUTH_INVALID_CREDENTIALS",
        "Thông tin đăng nhập không chính xác",
      );
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw codedError(
        UnauthorizedException,
        "AUTH_INVALID_CREDENTIALS",
        "Thông tin đăng nhập không chính xác",
      );
    }

    const block = passwordSignInBlock(user);
    if (block) {
      throw codedError(UnauthorizedException, block, SIGN_IN_BLOCK_MESSAGES[block]);
    }

    if (!user.isEmailVerified) {
      throw codedError(
        UnauthorizedException,
        "AUTH_EMAIL_NOT_VERIFIED",
        "Vui lòng xác thực email trước khi đăng nhập",
      );
    }

    return (await this.bootstrapSuperAdmin(user)) ?? user;
  }

  /** Sets the user's own password; ends a pending temp password. */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.password) {
      const matches =
        !!dto.currentPassword && (await bcrypt.compare(dto.currentPassword, user.password));
      if (!matches) {
        throw codedError(
          BadRequestException,
          "AUTH_WRONG_CURRENT_PASSWORD",
          "Mật khẩu hiện tại không đúng",
        );
      }
      if (await bcrypt.compare(dto.newPassword, user.password)) {
        throw codedError(
          BadRequestException,
          "AUTH_SAME_PASSWORD",
          "Mật khẩu mới phải khác mật khẩu hiện tại",
        );
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(dto.newPassword, 10),
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
    await this.activity.record({
      actorId: userId,
      action: "auth.password.changed",
      targetType: "user",
      targetId: userId,
    });
    return this.toSessionUser(updated);
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { verificationToken: token },
    });
    if (!user) {
      throw codedError(
        UnauthorizedException,
        "AUTH_INVALID_VERIFICATION_TOKEN",
        "Token xác thực không hợp lệ",
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null,
      },
    });

    return { success: true, email: user.email };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal user existence
      return {
        success: true,
        message: "Nếu email tồn tại, yêu cầu đặt lại mật khẩu đã được gửi",
      };
    }

    const resetPasswordToken = crypto.randomBytes(32).toString("hex");
    const resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken, resetPasswordExpires },
    });

    await this.mailService.sendResetPasswordEmail(
      user.email,
      resetPasswordToken,
      user.name || "",
    );
    return { success: true, message: "Yêu cầu đặt lại mật khẩu đã được gửi" };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: dto.token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw codedError(
        UnauthorizedException,
        "AUTH_INVALID_RESET_TOKEN",
        "Token không hợp lệ hoặc đã hết hạn",
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    return { success: true };
  }

  signToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // What the frontend gets for the signed-in user: profile + personalization
  toSessionUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      platformRole: user.platformRole,
      mustChangePassword: user.mustChangePassword,
      // Google-only accounts have no password to type as "current"
      hasPassword: !!user.password,
      preferences: {
        themeStyle: user.themeStyle,
        themeMode: user.themeMode,
        language: user.language,
        analyticsConsent: user.analyticsConsent,
      },
    };
  }

  async updatePreferences(
    id: string,
    prefs: { themeStyle?: string; themeMode?: string; language?: string; analyticsConsent?: boolean },
  ) {
    const user = await this.prisma.user.update({ where: { id }, data: prefs });
    return this.toSessionUser(user).preferences;
  }
}
