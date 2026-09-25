import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { ConnectionsController } from "./connections.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsModule } from "../connections/connections.module";

@Module({
  imports: [PrismaModule, ConnectionsModule],
  controllers: [IntegrationsController, ConnectionsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
