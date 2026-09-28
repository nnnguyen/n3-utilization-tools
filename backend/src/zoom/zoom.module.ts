import { Module } from "@nestjs/common";
import { ZoomService } from "./zoom.service";
import { ZoomController } from "./zoom.controller";
import { ZoomSyncSchedulerService } from "./zoom-sync-scheduler.service";
import { ZoomYoutubeMatchService } from "./youtube-match.service";
import { ZoomSyncRulesService } from "./sync-rules.service";
import { CaptionService } from "./caption.service";
import { ZoomSyncRulesController } from "./sync-rules.controller";
import { HttpModule } from "@nestjs/axios";
import { YoutubeModule } from "../youtube/youtube.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsModule } from "../connections/connections.module";
import { GoogleDriveModule } from "../google-drive/google-drive.module";
import { DriveBackupService } from "./drive-backup.service";

@Module({
  imports: [HttpModule, YoutubeModule, PrismaModule, ConnectionsModule, GoogleDriveModule],
  providers: [
    ZoomService,
    ZoomSyncSchedulerService,
    ZoomYoutubeMatchService,
    ZoomSyncRulesService,
    CaptionService,
    DriveBackupService,
  ],
  controllers: [ZoomController, ZoomSyncRulesController],
})
export class ZoomModule {}
