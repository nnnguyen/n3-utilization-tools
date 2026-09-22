import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { YoutubeService } from "./youtube.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
@Controller("youtube")
@UseGuards(JwtAuthGuard)
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get("status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getConnectionStatus(user.id);
  }
}
