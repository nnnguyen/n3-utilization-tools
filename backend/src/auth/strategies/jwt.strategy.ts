import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import { ACCESS_TOKEN_COOKIE } from "../auth.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { codedError } from "../../common/coded-error";
import { allowedWhilePasswordChangeRequired } from "../../admin/account-rules";

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  platformRole: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(private readonly prisma: PrismaService) {
    super({
      passReqToCallback: true,
      // Bearer header first: Safari and Firefox block the cross-site cookie
      // (frontend and backend are on different sites), so the frontend sends
      // the token itself. The cookie still works where browsers allow it.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request): string | null =>
          (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      ]),
      secretOrKey: process.env.JWT_SECRET ?? "",
    });
  }

  // The account's current state, not the token's: a locked account, a new
  // role or a pending password change apply at once, not at token expiry
  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        isLocked: true,
        mustChangePassword: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    if (user.isLocked) {
      throw codedError(
        UnauthorizedException,
        "AUTH_ACCOUNT_LOCKED",
        "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên",
      );
    }
    if (
      user.mustChangePassword &&
      !allowedWhilePasswordChangeRequired(req.method, req.originalUrl)
    ) {
      throw codedError(
        ForbiddenException,
        "AUTH_PASSWORD_CHANGE_REQUIRED",
        "Vui lòng đổi mật khẩu trước khi tiếp tục",
      );
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? "",
      platformRole: user.platformRole,
    };
  }
}
