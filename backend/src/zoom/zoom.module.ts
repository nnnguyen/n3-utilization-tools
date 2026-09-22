import { Module } from "@nestjs/common";
import { ZoomService } from "./zoom.service";
import { ZoomController } from "./zoom.controller";
import { HttpModule } from "@nestjs/axios";
import { YoutubeModule } from "../youtube/youtube.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [HttpModule, YoutubeModule, PrismaModule],
  providers: [ZoomService],
  controllers: [ZoomController],
})
export class ZoomModule {}
