import { Global, Module } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";

// Global: events are sent from many modules (auth, zoom, youtube, topics…)
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
