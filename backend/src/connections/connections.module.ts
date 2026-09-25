import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsService } from "./connections.service";
import { QuotaService } from "./quota.service";

// Connector framework (docs/design/P2-1-connector.md)
@Module({
  imports: [PrismaModule],
  providers: [ConnectionsService, QuotaService],
  exports: [ConnectionsService, QuotaService],
})
export class ConnectionsModule {}
