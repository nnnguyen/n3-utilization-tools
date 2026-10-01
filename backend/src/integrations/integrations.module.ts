import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { ConnectionsController } from "./connections.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsModule } from "../connections/connections.module";
import { GoogleDriveModule } from "../google-drive/google-drive.module";
import { OneDriveModule } from "../onedrive/onedrive.module";
import { ActivityModule } from "../activity/activity.module";
import { AnalyticsModule } from "../analytics/analytics.module";

@Module({
  imports: [
    PrismaModule,
    ConnectionsModule,
    GoogleDriveModule,
    OneDriveModule,
    ActivityModule,
    AnalyticsModule,
  ],
  controllers: [IntegrationsController, ConnectionsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
