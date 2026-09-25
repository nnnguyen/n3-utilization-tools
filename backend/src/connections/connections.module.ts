import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ConnectionsService } from "./connections.service";
import { QuotaService } from "./quota.service";
import { LegacyMirrorService } from "./legacy-mirror.service";
import { ConnectionReader } from "./connection-reader.service";

// Connector framework (docs/design/P2-1-connector.md)
@Module({
  imports: [PrismaModule],
  providers: [ConnectionsService, QuotaService, LegacyMirrorService, ConnectionReader],
  exports: [ConnectionsService, QuotaService, LegacyMirrorService, ConnectionReader],
})
export class ConnectionsModule {}
