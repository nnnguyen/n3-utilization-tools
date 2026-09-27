import { Controller, Get, Logger, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { GoogleDriveService } from "./google-drive.service";

// Authorizing Google Drive (P2-3a). The callback is public: Google redirects
// the browser here without the app's session; the signed state names the user.
@Controller("connections/google_drive")
export class GoogleDriveController {
  private readonly logger = new Logger(GoogleDriveController.name);

  constructor(private readonly drive: GoogleDriveService) {}

  @Get("auth-url")
  @UseGuards(JwtAuthGuard)
  async authUrl(@CurrentUser() user: AuthenticatedUser) {
    return { url: await this.drive.authUrl(user.id) };
  }

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const back = (result: string) =>
      res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?drive=${result}`);
    // Cancelled on Google's screen
    if (error) return back("cancelled");
    try {
      await this.drive.handleCallback(code, state);
      return back("connected");
    } catch (err) {
      this.logger.warn(`Google Drive authorization failed: ${err.message}`);
      return back("error");
    }
  }
}
