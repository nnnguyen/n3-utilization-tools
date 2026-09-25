import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsService } from "./connections.service";
import { QuotaService } from "./quota.service";
import { LegacyMirrorService } from "./legacy-mirror.service";

// Connector framework (docs/design/P2-1-connector.md)
@Module({
  imports: [PrismaModule],
  providers: [ConnectionsService, QuotaService, LegacyMirrorService],
  exports: [ConnectionsService, QuotaService, LegacyMirrorService],
})
export class ConnectionsModule {}
