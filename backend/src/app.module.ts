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

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TopicsModule,
    QuestionsModule,
    PublicModule,
    RealtimeModule,
    WordCloudModule,
    YoutubeModule,
    ZoomModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
