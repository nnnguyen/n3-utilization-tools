import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { ConnectionsController } from "./connections.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsModule } from "../connections/connections.module";
import { GoogleDriveModule } from "../google-drive/google-drive.module";

@Module({
  imports: [PrismaModule, ConnectionsModule, GoogleDriveModule],
  controllers: [IntegrationsController, ConnectionsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
