import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthCodeStore } from "./auth-code.store";
import { YoutubeService } from "../youtube/youtube.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GoogleCallbackGuard } from "./guards/google-callback.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { GoogleProfile } from "./strategies/google.strategy";
import type { AuthenticatedUser } from "./strategies/jwt.strategy";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  ACCESS_TOKEN_COOKIE_OPTIONS,
} from "./auth.constants";
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from "./dto/auth-email.dto";
import { UpdatePreferencesDto } from "./dto/preferences.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { codedError } from "../common/coded-error";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly youtubeService: YoutubeService,
    private readonly authCodeStore: AuthCodeStore,
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const user = await this.authService.login(dto);
    const token = this.authService.signToken(user);

    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      ...ACCESS_TOKEN_COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    });
    res.json({
      ...this.authService.toSessionUser(user),
      // For browsers that drop the cross-site cookie (Safari, Firefox)
      accessToken: token,
    });
  }

  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Body("token") token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleAuth() {
    // Passport redirects to Google's consent screen; no body needed.
  }

  @Get("google/callback")
  @UseGuards(GoogleCallbackGuard)
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    try {
      if (!req.user) {
        // Cancelled on Google's screen, or a code Google refused
        const error = req.googleAuthError ? "google_auth_error" : "google_auth_failed";
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=${error}`);
      }
      const user = await this.authService.validateOAuthUser(req.user);
      const token = this.authService.signToken(user);

      res.cookie(ACCESS_TOKEN_COOKIE, token, {
        ...ACCESS_TOKEN_COOKIE_OPTIONS,
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
      });
      // The login page trades this one-time code for the token (POST /auth/exchange)
      const code = this.authCodeStore.create(
        token,
        this.authService.toSessionUser(user),
      );
      res.redirect(
        `${process.env.FRONTEND_URL}/login?authCode=${encodeURIComponent(code)}`,
      );
    } catch (error) {
      if (error?.getResponse?.()?.code === "AUTH_ACCOUNT_LOCKED") {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_locked`);
      }
      console.error("Google Auth Error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_error`);
    }
  }

  @Post("exchange")
  @HttpCode(200)
  exchange(@Body("code") code: string) {
    const login = typeof code === "string" ? this.authCodeStore.consume(code) : null;
    if (!login) {
      throw codedError(
        UnauthorizedException,
        "AUTH_INVALID_LOGIN_CODE",
        "Mã đăng nhập không hợp lệ hoặc đã hết hạn",
      );
    }
    return { ...login.user, accessToken: login.token };
  }

  @Get("session")
  @UseGuards(JwtAuthGuard)
  async session(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.authService.findById(currentUser.id);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.authService.toSessionUser(user);
  }

  @Post("change-password")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(currentUser.id, dto);
  }

  @Patch("preferences")
  @UseGuards(JwtAuthGuard)
  updatePreferences(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.authService.updatePreferences(currentUser.id, dto);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res() res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_COOKIE_OPTIONS);
    res.json({ success: true });
  }

  @Get("youtube/callback")
  async handleYoutubeOAuthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    // state contains the userId
    await this.youtubeService.handleCallback(state, code);
    return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?tab=youtube`);
  }
}
