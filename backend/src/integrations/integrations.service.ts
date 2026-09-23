import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  UpdateZoomConfigDto,
  UpdateYoutubeConfigDto,
} from "./dto/update-config.dto";

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfigs(userId: string) {
    const [zoomConfig, youtubeConfig] = await Promise.all([
      this.prisma.zoomConfig.findUnique({ where: { userId } }),
      this.prisma.youtubeConfig.findUnique({ where: { userId } }),
    ]);

    return {
      zoom: zoomConfig || { isActive: false },
      youtube: youtubeConfig || { isActive: false },
    };
  }

  async updateZoomConfig(userId: string, dto: UpdateZoomConfigDto) {
    return this.prisma.zoomConfig.upsert({
      where: { userId },
      update: dto,
      create: {
        ...dto,
        userId,
      },
    });
  }

  async updateYoutubeConfig(userId: string, dto: UpdateYoutubeConfigDto) {
    return this.prisma.youtubeConfig.upsert({
      where: { userId },
      update: dto,
      create: {
        ...dto,
        userId,
      },
    });
  }
}
