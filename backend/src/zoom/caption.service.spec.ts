// @nestjs/axios v12 is ESM-only and Jest cannot require it
jest.mock("@nestjs/axios", () => ({ HttpService: class HttpService {} }));

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
});
