import { Test, TestingModule } from "@nestjs/testing";
import { google } from "googleapis";
import { YoutubeService } from "./youtube.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LegacyMirrorService } from "../connections/legacy-mirror.service";
import { ConnectionReader } from "../connections/connection-reader.service";

describe("YoutubeService", () => {
  let service: YoutubeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        { provide: PrismaService, useValue: {} },
        { provide: ConnectionReader, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: LegacyMirrorService, useValue: { mirrorYoutube: jest.fn(), mirrorYoutubeQuota: jest.fn() } },
      ],
    }).compile();

    service = module.get<YoutubeService>(YoutubeService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("checkVideoProcessingStatus when the video was deleted on YouTube", () => {
    const recordingId = "rec-1";
    let prisma: any;
    let notifications: { create: jest.Mock };
    let deletedService: YoutubeService;
    let syncStatus: string;

    beforeEach(async () => {
      syncStatus = "PROCESSING";
      prisma = {
        youtubeConfig: {
          findUnique: jest.fn().mockResolvedValue({
            userId: "user-1",
            isActive: true,
            refreshToken: "token",
          }),
        },
        zoomSyncLog: {
          // Mimics the conditional update on a single row
          updateMany: jest.fn(async ({ where, data }) => {
            if (syncStatus === where.syncStatus.not) return { count: 0 };
            syncStatus = data.syncStatus;
            return { count: 1 };
          }),
          update: jest.fn().mockResolvedValue({
            userId: "user-1",
            meeting: "SOH meeting",
            autoRetryCount: 0,
            syncError: "Video đã bị xoá trên YouTube",
          }),
        },
      };
      notifications = { create: jest.fn() };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          YoutubeService,
          { provide: PrismaService, useValue: prisma },
          // Flag off: reads the mocked legacy tables
          { provide: ConnectionReader, useValue: new ConnectionReader(prisma, {} as any) },
          { provide: NotificationsService, useValue: notifications },
          { provide: LegacyMirrorService, useValue: { mirrorYoutube: jest.fn(), mirrorYoutubeQuota: jest.fn() } },
        ],
      }).compile();
      deletedService = module.get<YoutubeService>(YoutubeService);

      jest
        .spyOn(deletedService as any, "getOAuthClient")
        .mockResolvedValue({ setCredentials: jest.fn() });
      jest
        .spyOn(deletedService as any, "trackQuotaUsage")
        .mockResolvedValue(undefined);
      jest.spyOn(google, "youtube").mockReturnValue({
        videos: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) },
      } as any);
    });

    afterEach(() => jest.restoreAllMocks());

    it("marks the sync FAILED once, without auto-retry, and notifies once", async () => {
      const first = await deletedService.checkVideoProcessingStatus(
        "vid-1",
        recordingId,
        "user-1",
      );
      expect(first.syncStatus).toBe("FAILED");
      expect(prisma.zoomSyncLog.updateMany).toHaveBeenCalledWith({
        where: { recordingId, syncStatus: { not: "FAILED" } },
        data: expect.objectContaining({
          syncStatus: "FAILED",
          errorSource: "youtube_processing",
          errorCode: "VIDEO_NOT_FOUND",
          syncError: "Video đã bị xoá trên YouTube",
          nextRetryAt: null,
        }),
      });
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "sync_failed", recordingId }),
      );
      // No auto-retry scheduled: the only `update` is the failureCount increment
      expect(prisma.zoomSyncLog.update).toHaveBeenCalledTimes(1);

      const second = await deletedService.checkVideoProcessingStatus(
        "vid-1",
        recordingId,
        "user-1",
      );
      expect(second.syncStatus).toBe("FAILED");
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(prisma.zoomSyncLog.update).toHaveBeenCalledTimes(1);
    });

    it("still throws when no recording is known", async () => {
      await expect(
        deletedService.checkVideoProcessingStatus("vid-1", undefined, "user-1"),
      ).rejects.toThrow("Video not found on YouTube");
      expect(prisma.zoomSyncLog.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("uploadCaptionTrack", () => {
    let captions: any;
    let captionService: YoutubeService;

    beforeEach(() => {
      captions = {
        list: jest.fn().mockResolvedValue({ data: { items: [] } }),
        insert: jest.fn().mockResolvedValue({ data: { id: "new-track" } }),
        update: jest.fn().mockResolvedValue({ data: { id: "old-track" } }),
      };
      captionService = new YoutubeService({} as any, {} as any, {} as any, {} as any);
      jest.spyOn(captionService as any, "getYoutubeClient").mockResolvedValue({ captions });
      jest.spyOn(captionService as any, "trackQuotaUsage").mockResolvedValue(undefined);
    });

    const track = { language: "vi", name: "Tiếng Việt (Zoom)", vtt: "WEBVTT" };

    it("adds a new track and counts list + insert quota", async () => {
      await expect(captionService.uploadCaptionTrack("user-1", "vid-1", track)).resolves.toBe("new-track");
      expect(captions.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            snippet: { videoId: "vid-1", language: "vi", name: "Tiếng Việt (Zoom)", isDraft: false },
          },
        }),
      );
      expect((captionService as any).trackQuotaUsage.mock.calls.map((c: any) => c[1])).toEqual([50, 400]);
    });

    it("replaces the track with the same language and name instead of duplicating it", async () => {
      captions.list.mockResolvedValue({
        data: { items: [{ id: "old-track", snippet: { language: "vi", name: "Tiếng Việt (Zoom)" } }] },
      });
      await expect(captionService.uploadCaptionTrack("user-1", "vid-1", track)).resolves.toBe("old-track");
      expect(captions.insert).not.toHaveBeenCalled();
      expect(captions.update).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { id: "old-track", snippet: { isDraft: false } } }),
      );
    });
  });
});
