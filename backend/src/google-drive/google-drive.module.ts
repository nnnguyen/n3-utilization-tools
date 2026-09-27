import { Module } from "@nestjs/common";
import { ConnectionsModule } from "../connections/connections.module";
import { GoogleDriveController } from "./google-drive.controller";
import { GoogleDriveService } from "./google-drive.service";

// Google Drive (P2-3): connection now, backups of Zoom files next (P2-3b)
@Module({
  imports: [ConnectionsModule],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
