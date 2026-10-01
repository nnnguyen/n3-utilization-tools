import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TopicsModule } from "./topics/topics.module";
import { QuestionsModule } from "./questions/questions.module";
import { PublicModule } from "./public/public.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WordCloudModule } from "./word-cloud/word-cloud.module";
import { YoutubeModule } from "./youtube/youtube.module";
import { ZoomModule } from "./zoom/zoom.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ConnectionsModule } from "./connections/connections.module";
import { AdminModule } from "./admin/admin.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { GoogleDriveModule } from "./google-drive/google-drive.module";
import { OneDriveModule } from "./onedrive/onedrive.module";
import { ActivityModule } from "./activity/activity.module";
import { QrModule } from './qr/qr.module';

@Module({
  imports: [
    PrismaModule,
    AnalyticsModule,
    ActivityModule,
    AuthModule,
    WorkspacesModule,
    TopicsModule,
    QuestionsModule,
    PublicModule,
    RealtimeModule,
    WordCloudModule,
    YoutubeModule,
    ZoomModule,
    IntegrationsModule,
    NotificationsModule,
    ConnectionsModule,
    GoogleDriveModule,
    OneDriveModule,
    AdminModule,
    QrModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
