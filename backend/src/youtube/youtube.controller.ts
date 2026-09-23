import { Controller, Get, Post, Body, UseGuards, Param } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { YoutubeService } from "./youtube.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { Response } from "express";
@Controller("youtube")
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @UseGuards(JwtAuthGuard)
  @Get("status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getConnectionStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("quota")
  getQuota(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getQuotaStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("auth-url")
  async getAuthUrl(@CurrentUser() user: AuthenticatedUser) {
    const url = await this.youtubeService.getAuthUrl(user.id);
    return { url };
  }

  @UseGuards(JwtAuthGuard)
  @Get("recordings/:id/status")
  async getRecordingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.youtubeService.getRecordingStatusFromDb(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("recent-uploads")
  async getRecentUploads(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getRecentUploads(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("recordings/:id/refresh-status")
  async refreshRecordingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.youtubeService.refreshRecordingStatus(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("callback")
  handleCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code: string },
  ) {
    return this.youtubeService.handleCallback(user.id, body.code);
  }
}
