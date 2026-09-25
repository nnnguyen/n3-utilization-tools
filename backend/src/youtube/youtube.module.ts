import { Module } from "@nestjs/common";
import { YoutubeService } from "./youtube.service";
import { YoutubeController } from "./youtube.controller";
import { YoutubeStatsService } from "./youtube-stats.service";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConnectionsModule } from "../connections/connections.module";

@Module({
  imports: [PrismaModule, NotificationsModule, ConnectionsModule],
  providers: [YoutubeService, YoutubeStatsService],
  controllers: [YoutubeController],
  exports: [YoutubeService],
})
export class YoutubeModule {}
