import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  UpdateZoomConfigDto,
  UpdateYoutubeConfigDto,
} from "./dto/update-config.dto";
import {
  stripEmptySecrets,
  toPublicConfig,
  toPublicYoutubeConfig,
  toPublicZoomConfig,
  YOUTUBE_SECRET_FIELDS,
  ZOOM_SECRET_FIELDS,
} from "./public-config";

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfigs(userId: string) {
    const [zoomConfig, youtubeConfig] = await Promise.all([
      this.prisma.zoomConfig.findUnique({ where: { userId } }),
      this.prisma.youtubeConfig.findUnique({ where: { userId } }),
    ]);

    return toPublicConfig(zoomConfig, youtubeConfig);
  }

  async updateZoomConfig(userId: string, dto: UpdateZoomConfigDto) {
    const data = stripEmptySecrets(dto, ZOOM_SECRET_FIELDS);
    const config = await this.prisma.zoomConfig.upsert({
      where: { userId },
      update: data,
      create: {
        ...data,
        userId,
      },
    });
    return toPublicZoomConfig(config);
  }

  async updateYoutubeConfig(userId: string, dto: UpdateYoutubeConfigDto) {
    const data = stripEmptySecrets(dto, YOUTUBE_SECRET_FIELDS);
    const config = await this.prisma.youtubeConfig.upsert({
      where: { userId },
      update: data,
      create: {
        ...data,
        userId,
      },
    });
    return toPublicYoutubeConfig(config);
  }
}
