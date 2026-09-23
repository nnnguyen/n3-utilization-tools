import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  UseGuards,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage, memoryStorage } from "multer";
import { tmpdir } from "os";
import { extname } from "path";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { YoutubeService } from "./youtube.service";
import { YoutubeStatsService } from "./youtube-stats.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { Response } from "express";
import { UploadVideoDto } from "./upload-video.dto";
import { UpdateVideoDto } from "./update-video.dto";
import { CreatePlaylistDto, UpdatePlaylistDto } from "./playlist.dto";

const MANUAL_UPLOAD_MAX_MB = parseInt(
  process.env.YOUTUBE_MANUAL_UPLOAD_MAX_MB || "2048",
  10,
);
@Controller("youtube")
export class YoutubeController {
  constructor(
    private readonly youtubeService: YoutubeService,
    private readonly youtubeStatsService: YoutubeStatsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get("status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getConnectionStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("token-status")
  getTokenStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getTokenStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("quota")
  getQuota(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getQuotaStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("stats")
  getStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query("months") months?: string,
  ) {
    return this.youtubeStatsService.getStats(user.id, months ? parseInt(months, 10) || 6 : 6);
  }

  @UseGuards(JwtAuthGuard)
  @Get("auth-url")
  async getAuthUrl(@CurrentUser() user: AuthenticatedUser) {
    const url = await this.youtubeService.getAuthUrl(user.id);
    return { url };
  }

  @UseGuards(JwtAuthGuard)
  @Get("recordings/:id/status")
  async getRecordingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.youtubeService.getRecordingStatusFromDb(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("recent-uploads")
  async getRecentUploads(
    @CurrentUser() user: AuthenticatedUser,
    @Query("months") months?: string,
  ) {
    const monthsBack = months ? parseInt(months, 10) : NaN;
    if (!monthsBack || monthsBack < 1) {
      return this.youtubeService.getRecentUploads(user.id);
    }
    // Same window as /youtube/stats: from the 1st of the oldest month shown
    const now = new Date();
    const since = new Date(
      now.getFullYear(),
      now.getMonth() - (Math.min(monthsBack, 24) - 1),
      1,
    );
    return this.youtubeService.getRecentUploads(user.id, undefined, since);
  }

  // Served from the DB cache; refreshed from YouTube only when older than an hour
  @UseGuards(JwtAuthGuard)
  @Get("channel/videos")
  async getChannelVideos(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getChannelVideos(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("channel/videos/refresh")
  async refreshChannelVideos(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.getChannelVideos(user.id, true);
  }

  @UseGuards(JwtAuthGuard)
  @Get("playlists")
  async listPlaylists(@CurrentUser() user: AuthenticatedUser) {
    return this.youtubeService.listPlaylists(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("playlists")
  async createPlaylist(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePlaylistDto,
  ) {
    return this.youtubeService.createPlaylist(
      user.id,
      body.title,
      body.privacyStatus,
      body.description,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch("playlists/:playlistId")
  async updatePlaylist(
    @CurrentUser() user: AuthenticatedUser,
    @Param("playlistId") playlistId: string,
    @Body() body: UpdatePlaylistDto,
  ) {
    return this.youtubeService.updatePlaylist(user.id, playlistId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("playlists/:playlistId")
  async deletePlaylist(
    @CurrentUser() user: AuthenticatedUser,
    @Param("playlistId") playlistId: string,
  ) {
    return this.youtubeService.deletePlaylist(user.id, playlistId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("playlists/:playlistId/items")
  async listPlaylistItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param("playlistId") playlistId: string,
  ) {
    return this.youtubeService.listPlaylistItems(user.id, playlistId);
  }

  // Takes the playlist *item* id (one entry in the playlist), not the video id
  @UseGuards(JwtAuthGuard)
  @Delete("playlists/:playlistId/items/:playlistItemId")
  async removePlaylistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("playlistItemId") playlistItemId: string,
  ) {
    return this.youtubeService.removePlaylistItem(user.id, playlistItemId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (req, file, cb) => {
          cb(null, `yt-upload-${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MANUAL_UPLOAD_MAX_MB * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("video/")) {
          return cb(new BadRequestException("Only video files are allowed"), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadVideo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    // Validated here instead of by the global pipe: the pipe runs after multer
    // has written the file, so a rejected body would leave it in the temp dir.
    @Body() rawBody: Record<string, unknown>,
  ) {
    if (!file) {
      throw new BadRequestException("Video file is required");
    }
    try {
      const body = plainToInstance(UploadVideoDto, rawBody);
      const errors = await validate(body, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new BadRequestException(
          errors.flatMap((e) => Object.values(e.constraints || {})),
        );
      }
      return await this.youtubeService.uploadManualVideo(
        user.id,
        file.path,
        body.title,
        body.description || "",
        body.privacyStatus || "private",
        body.playlistId,
      );
    } finally {
      fs.promises.unlink(file.path).catch(() => undefined);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get("videos/:videoId")
  async getVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("videoId") videoId: string,
  ) {
    return this.youtubeService.getVideoMetadata(user.id, videoId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("videos/:videoId")
  async updateVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("videoId") videoId: string,
    @Body() body: UpdateVideoDto,
  ) {
    return this.youtubeService.updateVideoMetadata(user.id, videoId, body);
  }

  // YouTube accepts JPG/PNG thumbnails up to 2MB
  @UseGuards(JwtAuthGuard)
  @Post("videos/:videoId/thumbnail")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
          return cb(new BadRequestException("Thumbnail must be a JPG or PNG image"), false);
        }
        cb(null, true);
      },
    }),
  )
  async setThumbnail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("videoId") videoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("Thumbnail image is required");
    }
    return this.youtubeService.setThumbnail(user.id, videoId, file.buffer, file.mimetype);
  }

  @UseGuards(JwtAuthGuard)
  @Post("recordings/:id/refresh-status")
  async refreshRecordingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.youtubeService.refreshRecordingStatus(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("callback")
  handleCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code: string },
  ) {
    return this.youtubeService.handleCallback(user.id, body.code);
  }
}
