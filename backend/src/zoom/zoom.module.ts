import { Module } from "@nestjs/common";
import { ZoomService } from "./zoom.service";
import { ZoomController } from "./zoom.controller";
import { ZoomSyncSchedulerService } from "./zoom-sync-scheduler.service";
import { ZoomYoutubeMatchService } from "./youtube-match.service";
import { ZoomSyncRulesService } from "./sync-rules.service";
import { ZoomSyncRulesController } from "./sync-rules.controller";
import { HttpModule } from "@nestjs/axios";
import { YoutubeModule } from "../youtube/youtube.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [HttpModule, YoutubeModule, PrismaModule],
  providers: [
    ZoomService,
    ZoomSyncSchedulerService,
    ZoomYoutubeMatchService,
    ZoomSyncRulesService,
  ],
  controllers: [ZoomController, ZoomSyncRulesController],
})
export class ZoomModule {}
