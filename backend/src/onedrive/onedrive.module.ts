import { Module } from "@nestjs/common";
import { OneDriveService } from "./onedrive.service";
import { OneDriveController } from "./onedrive.controller";
import { ConnectionsModule } from "../connections/connections.module";
import { AnalyticsModule } from "../analytics/analytics.module";

@Module({
  imports: [ConnectionsModule, AnalyticsModule],
  providers: [OneDriveService],
  controllers: [OneDriveController],
  exports: [OneDriveService],
})
export class OneDriveModule {}
