import { Module } from "@nestjs/common";
import { YoutubeService } from "./youtube.service";
import { YoutubeController } from "./youtube.controller";
import { YoutubeStatsService } from "./youtube-stats.service";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [YoutubeService, YoutubeStatsService],
  controllers: [YoutubeController],
  exports: [YoutubeService],
})
export class YoutubeModule {}
