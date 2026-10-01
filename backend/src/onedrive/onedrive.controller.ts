import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { OneDriveService } from "./onedrive.service";

@Controller("connections/onedrive")
export class OneDriveController {
  private readonly logger = new Logger(OneDriveController.name);

  constructor(private readonly onedrive: OneDriveService) {}

  @Get("auth-url")
  @UseGuards(JwtAuthGuard)
  async authUrl(@CurrentUser() user: AuthenticatedUser) {
    return { url: await this.onedrive.authUrl(user.id) };
  }

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const back = (result: string) =>
      res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?onedrive=${result}`);
    
    if (error) return back("cancelled");
    try {
      await this.onedrive.handleCallback(code, state);
      return back("connected");
    } catch (err) {
      this.logger.warn(`Microsoft OneDrive authorization failed: ${err.message}`);
      return back("error");
    }
  }

  @Get("files")
  @UseGuards(JwtAuthGuard)
  async listFiles(@CurrentUser() user: AuthenticatedUser, @Query("folderId") folderId?: string) {
    return this.onedrive.listFiles(user.id, folderId);
  }

  @Post("folders")
  @UseGuards(JwtAuthGuard)
  async createFolder(
    @CurrentUser() user: AuthenticatedUser,
    @Body("name") name: string,
    @Body("parentId") parentId?: string,
  ) {
    return this.onedrive.createFolder(user.id, name, parentId);
  }

  @Patch("files/:id")
  @UseGuards(JwtAuthGuard)
  async renameItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body("name") name: string,
  ) {
    return this.onedrive.renameItem(user.id, id, name);
  }

  @Delete("files/:id")
  @UseGuards(JwtAuthGuard)
  async deleteItem(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.onedrive.deleteItem(user.id, id);
  }
}
