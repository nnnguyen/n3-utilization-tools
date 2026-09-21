import { Module } from "@nestjs/common";
import { ZoomService } from "./zoom.service";
import { ZoomController } from "./zoom.controller";
import { HttpModule } from "@nestjs/axios";
import { YoutubeModule } from "../youtube/youtube.module";

@Module({
  imports: [HttpModule, YoutubeModule],
  providers: [ZoomService],
  controllers: [ZoomController],
})
export class ZoomModule {}
