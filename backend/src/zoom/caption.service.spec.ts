// @nestjs/axios v12 is ESM-only and Jest cannot require it
jest.mock("@nestjs/axios", () => ({ HttpService: class HttpService {} }));

import { UnauthorizedException } from "@nestjs/common";
import { CaptionService } from "./caption.service";

describe("CaptionService", () => {
  const completedLog = {
    recordingId: "rec-1",
    userId: "user-1",
    meeting: "SOH meeting",
    syncStatus: "COMPLETED",
    youtubeVideoId: "vid-1",
  };
  let prisma: any;
  let zoom: any;
  let youtube: any;
  let service: CaptionService;
  let updates: any[];

  beforeEach(() => {
    updates = [];
    prisma = {
      zoomSyncLog: {
        findUnique: jest.fn().mockResolvedValue(completedLog),
        update: jest.fn(async ({ data }) => updates.push(data)),
      },
    };
    zoom = {
      getSyncOptions: jest.fn().mockResolvedValue({
        captionsEnabled: true,
        captionLanguage: "vi",
        captionName: null,
      }),
      fetchRecordingFiles: jest.fn().mockResolvedValue([
        { file_type: "MP4", download_url: "mp4" },
        { file_type: "TRANSCRIPT", download_url: "vtt-url", status: "completed" },
      ]),
      downloadRecordingText: jest.fn().mockResolvedValue("WEBVTT\n\n00:00.000 --> 00:01.000\nXin chào"),
    };
    youtube = {
      onSyncCompleted: jest.fn(),
      hasQuotaFor: jest.fn().mockResolvedValue(true),
      captionUploadCost: 500,
      uploadCaptionTrack: jest.fn().mockResolvedValue("track-1"),
      describeYoutubeError: jest.fn(() => ({
        errorCode: "quotaExceeded",
        errorMessage: "Đã hết quota API YouTube trong ngày, thử lại vào ngày mai",
      })),
    };
    service = new CaptionService(prisma, zoom, youtube);
  });

  it("registers itself to run after each completed sync", async () => {
    service.onModuleInit();
    expect(youtube.onSyncCompleted).toHaveBeenCalledTimes(1);
    await youtube.onSyncCompleted.mock.calls[0][0]("rec-1", "vid-1");
    expect(youtube.uploadCaptionTrack).toHaveBeenCalled();
  });

  it("uploads the transcript as a caption track in the chosen language", async () => {
    await expect(service.tryUpload("rec-1")).resolves.toEqual({ status: "uploaded" });
    expect(zoom.downloadRecordingText).toHaveBeenCalledWith("user-1", "vtt-url");
    expect(youtube.uploadCaptionTrack).toHaveBeenCalledWith("user-1", "vid-1", {
      language: "vi",
      name: "Tiếng Việt (Zoom)",
      vtt: expect.stringContaining("Xin chào"),
    });
    expect(updates.at(-1)).toMatchObject({ captionStatus: "uploaded", captionTrackId: "track-1" });
    // Captions never touch the sync itself
    for (const data of updates) expect(data).not.toHaveProperty("syncStatus");
  });

  it("does nothing while captions are off, unless asked by hand", async () => {
    zoom.getSyncOptions.mockResolvedValue({ captionsEnabled: false, captionLanguage: "vi" });
    await expect(service.tryUpload("rec-1")).resolves.toMatchObject({ status: "skipped" });
    expect(zoom.fetchRecordingFiles).not.toHaveBeenCalled();
    await expect(service.tryUpload("rec-1", { manual: true })).resolves.toEqual({ status: "uploaded" });
  });

  it("skips videos that are not ready yet", async () => {
    prisma.zoomSyncLog.findUnique.mockResolvedValue({ ...completedLog, syncStatus: "PROCESSING" });
    await expect(service.tryUpload("rec-1")).resolves.toMatchObject({ status: "skipped" });
    expect(updates).toHaveLength(0);
  });

  it("waits when Zoom has no transcript yet", async () => {
    zoom.fetchRecordingFiles.mockResolvedValue([{ file_type: "MP4", download_url: "mp4" }]);
    await expect(service.tryUpload("rec-1")).resolves.toEqual({ status: "waiting_transcript" });
    expect(updates.at(-1)).toMatchObject({ captionStatus: "waiting_transcript" });
    expect(youtube.uploadCaptionTrack).not.toHaveBeenCalled();
  });

  it("records a YouTube error with its code, without throwing", async () => {
    youtube.uploadCaptionTrack.mockRejectedValue(new Error("quota"));
    await expect(service.tryUpload("rec-1")).resolves.toEqual({
      status: "failed",
      reason: "quotaExceeded",
    });
    expect(updates.at(-1)).toMatchObject({ captionStatus: "failed", captionErrorCode: "quotaExceeded" });
  });

  it("does not spend quota it does not have", async () => {
    youtube.hasQuotaFor.mockResolvedValue(false);
    await expect(service.tryUpload("rec-1")).resolves.toMatchObject({ reason: "quotaExceeded" });
    expect(zoom.fetchRecordingFiles).not.toHaveBeenCalled();
  });

  it("continues a recording already in the caption workflow when its transcript arrives", async () => {
    prisma.zoomSyncLog.findUnique
      .mockResolvedValueOnce({ captionStatus: "waiting_transcript" })
      .mockResolvedValue(completedLog);
    zoom.getSyncOptions.mockResolvedValue({ captionsEnabled: false, captionLanguage: "vi" });
    await expect(service.onTranscriptReady("rec-1")).resolves.toEqual({ status: "uploaded" });
  });

  it("sweeps: retries due recordings, gives up after 48 h, caps uploads", async () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
    const waiting = (id: string, completedHoursAgo: number) => ({
      recordingId: id,
      captionStatus: "waiting_transcript",
      captionErrorCode: null,
      captionAttempts: 0,
      captionUpdatedAt: hoursAgo(1),
      syncCompletedAt: hoursAgo(completedHoursAgo),
    });
    prisma.zoomSyncLog.findMany = jest.fn().mockResolvedValue([
      waiting("old", 50),
      ...Array.from({ length: 7 }, (_, i) => waiting(`r${i}`, 2)),
    ]);
    const tryUpload = jest.spyOn(service, "tryUpload").mockResolvedValue({ status: "uploaded" });

    await service.sweep(now);

    expect(updates).toContainEqual(expect.objectContaining({ captionStatus: "no_transcript" }));
    expect(tryUpload).toHaveBeenCalledTimes(5);
    expect(tryUpload).toHaveBeenCalledWith("r0", { manual: true });
  });

  it("records a deleted video as VIDEO_NOT_FOUND (not retried)", async () => {
    youtube.uploadCaptionTrack.mockRejectedValue(Object.assign(new Error("not found"), { code: 404 }));
    await expect(service.tryUpload("rec-1")).resolves.toEqual({ status: "failed", reason: "VIDEO_NOT_FOUND" });
    expect(updates.at(-1)).toMatchObject({ captionErrorCode: "VIDEO_NOT_FOUND", captionError: "Video đã bị xoá trên YouTube" });
  });

  it("records a missing YouTube connection with a translatable code", async () => {
    youtube.uploadCaptionTrack.mockRejectedValue(new UnauthorizedException("YouTube not connected"));
    await expect(service.tryUpload("rec-1")).resolves.toEqual({ status: "failed", reason: "YOUTUBE_NOT_CONNECTED" });
    expect(updates.at(-1)).toMatchObject({ captionStatus: "failed", captionErrorCode: "YOUTUBE_NOT_CONNECTED" });
  });

  describe("uploadForUser", () => {
    it("uploads by hand with captions off and resets the retry count", async () => {
      zoom.getSyncOptions.mockResolvedValue({ captionsEnabled: false, captionLanguage: "vi" });
      await expect(service.uploadForUser("user-1", "rec-1")).resolves.toMatchObject({ status: "uploaded" });
      expect(updates[0]).toEqual({ captionAttempts: 0 });
    });

    it("refuses a recording of another account", async () => {
      await expect(service.uploadForUser("user-2", "rec-1")).rejects.toMatchObject({
        response: { code: "CAPTION_RECORDING_NOT_FOUND" },
      });
      prisma.zoomSyncLog.findUnique.mockResolvedValue(null);
      await expect(service.uploadForUser("user-1", "rec-x")).rejects.toMatchObject({
        response: { code: "CAPTION_RECORDING_NOT_FOUND" },
      });
      expect(youtube.uploadCaptionTrack).not.toHaveBeenCalled();
    });

    it("refuses a video that is not on YouTube yet", async () => {
      prisma.zoomSyncLog.findUnique.mockResolvedValue({ ...completedLog, syncStatus: "UPLOADING" });
      await expect(service.uploadForUser("user-1", "rec-1")).rejects.toMatchObject({
        response: { code: "CAPTION_VIDEO_NOT_READY" },
      });
      expect(updates).toHaveLength(0);
    });
  });
});
