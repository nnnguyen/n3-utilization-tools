import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ZoomService } from "./zoom.service";
import { YoutubeService } from "../youtube/youtube.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectionReader } from "../connections/connection-reader.service";

// @nestjs/axios v12 is ESM-only and Jest cannot require it; these tests never
// call Zoom, so a stand-in HttpService class is enough.
jest.mock("@nestjs/axios", () => ({ HttpService: class HttpService {} }));

describe("ZoomService", () => {
  let service: ZoomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZoomService,
        { provide: HttpService, useValue: {} },
        { provide: YoutubeService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: ConnectionReader, useValue: {} },
      ],
    }).compile();

    service = module.get<ZoomService>(ZoomService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // Zoom silently trims any recordings query longer than a month, so wide
  // ranges are split into monthly windows (private helper)
  describe("splitIntoMonthWindows", () => {
    const split = (from: string, to: string): { from: string; to: string }[] =>
      (service as any).splitIntoMonthWindows(from, to);
    const dayBefore = (date: string) => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };

    it("keeps a range of a month or less as one window", () => {
      expect(split("2026-08-25", "2026-09-24")).toEqual([
        { from: "2026-08-25", to: "2026-09-24" },
      ]);
    });

    it("covers a long range with contiguous windows of at most a month, newest first", () => {
      const windows = split("2026-01-01", "2026-09-24");
      expect(windows[0]).toEqual({ from: "2026-08-24", to: "2026-09-24" });
      expect(windows[windows.length - 1].from).toBe("2026-01-01");
      for (let i = 1; i < windows.length; i++) {
        // no gap and no overlap between consecutive windows
        expect(windows[i].to).toBe(dayBefore(windows[i - 1].from));
      }
      for (const w of windows) {
        const days = (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000;
        expect(days).toBeLessThanOrEqual(31);
      }
    });

    it("stops after 24 windows for very old start dates", () => {
      const windows = split("2015-01-01", "2026-09-24");
      expect(windows).toHaveLength(24);
      expect(windows[windows.length - 1].from > "2015-01-01").toBe(true);
    });
  });

  describe("webhook path and workflow settings", () => {
    const payload = {
      account_id: "zoom-acc",
      download_token: "dl",
      object: {
        uuid: "rec-1",
        topic: "SOH",
        start_time: "2026-09-25T10:05:00Z",
        recording_files: [],
      },
    };
    let prisma: any;
    let settingsService: ZoomService;

    beforeEach(async () => {
      prisma = {
        zoomWorkflowSettings: { findUnique: jest.fn().mockResolvedValue(null) },
        zoomSyncRule: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findUnique: jest.fn().mockResolvedValue({ language: "vi" }) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ZoomService,
          { provide: HttpService, useValue: {} },
          { provide: YoutubeService, useValue: {} },
          { provide: PrismaService, useValue: prisma },
          { provide: ConnectionReader, useValue: {} },
        ],
      }).compile();
      settingsService = module.get<ZoomService>(ZoomService);
    });

    it("does not upload when the owner turned auto-upload off", async () => {
      prisma.zoomWorkflowSettings.findUnique.mockResolvedValue({
        autoUpload: false,
        titleTemplate: "{topic}",
        descriptionTemplate: "",
        privacyStatus: "private",
        playlistId: null,
        timeZone: "Asia/Ho_Chi_Minh",
      });
      const sync = jest
        .spyOn(settingsService as any, "processRecordingSync")
        .mockResolvedValue({ id: "vid" });

      await expect(
        settingsService.handleRecordingCompleted(payload, "user-1"),
      ).resolves.toBeNull();
      expect(sync).not.toHaveBeenCalled();
    });

    it("uploads with the saved privacy and playlist", async () => {
      prisma.zoomWorkflowSettings.findUnique.mockResolvedValue({
        autoUpload: true,
        titleTemplate: "[Zoom] {topic}",
        descriptionTemplate: "",
        privacyStatus: "unlisted",
        playlistId: "PL1",
        timeZone: "Asia/Ho_Chi_Minh",
      });
      const sync = jest
        .spyOn(settingsService as any, "processRecordingSync")
        .mockResolvedValue({ id: "vid" });

      await settingsService.handleRecordingCompleted(payload, "user-1");
      expect(sync).toHaveBeenCalledWith(
        "rec-1",
        [],
        "SOH",
        "2026-09-25T10:05:00Z",
        "user-1",
        "dl",
        "unlisted",
        "PL1",
        undefined,
        null,
      );
    });

    it("does not auto-upload without saved settings (off by default)", async () => {
      const sync = jest
        .spyOn(settingsService as any, "processRecordingSync")
        .mockResolvedValue({ id: "vid" });

      await expect(
        settingsService.handleRecordingCompleted(payload, "user-1"),
      ).resolves.toBeNull();
      expect(sync).not.toHaveBeenCalled();
      // A manual sync still gets the historical title and description
      await expect(
        (settingsService as any).renderUploadText("user-1", "SOH", "2026-09-25T10:05:00Z"),
      ).resolves.toEqual({
        title: "Zoom Recording: SOH",
        description: "Recorded on 25/09/2026 17:05",
        tags: [],
      });
    });

    it("applies the matching topic rule and its publish delay", async () => {
      prisma.zoomWorkflowSettings.findUnique.mockResolvedValue({
        autoUpload: true,
        titleTemplate: "Zoom Recording: {topic}",
        descriptionTemplate: "Recorded on {date} {time}",
        privacyStatus: "private",
        playlistId: null,
        timeZone: "Asia/Ho_Chi_Minh",
      });
      prisma.zoomSyncRule.findMany.mockResolvedValue([
        {
          id: "rule-1",
          position: 0,
          matchText: "soh",
          titleTemplate: "SOH {date}",
          descriptionTemplate: null,
          playlistId: "PL-soh",
          tags: ["soh"],
          privacyStatus: "public",
          publishDelayMinutes: 120,
        },
      ]);
      const sync = jest
        .spyOn(settingsService as any, "processRecordingSync")
        .mockResolvedValue({ id: "vid" });

      await settingsService.handleRecordingCompleted(
        {
          ...payload,
          object: {
            ...payload.object,
            recording_files: [{ recording_end: "2026-09-25T11:05:00Z" }],
          },
        },
        "user-1",
      );
      const args = sync.mock.calls[0];
      expect(args[6]).toBe("public");
      expect(args[7]).toBe("PL-soh");
      expect((args[9] as Date).toISOString()).toBe("2026-09-25T13:05:00.000Z");
      await expect(
        (settingsService as any).renderUploadText("user-1", "SOH", "2026-09-25T10:05:00Z"),
      ).resolves.toMatchObject({ title: "SOH 25/09/2026", tags: ["soh"] });
    });

    it("renders the title from the saved template", async () => {
      prisma.zoomWorkflowSettings.findUnique.mockResolvedValue({
        autoUpload: true,
        titleTemplate: "[Zoom] {topic} - {date}",
        descriptionTemplate: "Buổi {topic}",
        privacyStatus: "private",
        playlistId: null,
        timeZone: "Asia/Ho_Chi_Minh",
      });
      await expect(
        (settingsService as any).renderUploadText("user-1", "SOH", "2026-09-25T10:05:00Z"),
      ).resolves.toEqual({
        title: "[Zoom] SOH - 25/09/2026",
        description: "Buổi SOH",
        tags: [],
      });
    });
  });

  describe("findWebhookOwner on Connection data (CONNECTIONS_READ=true)", () => {
    const env = { ...process.env };
    afterEach(() => {
      process.env = { ...env };
    });

    const view = (userId: string, legacyUpdatedAt: string, copiedAt: string, over: any = {}) => ({
      id: userId,
      userId,
      provider: "zoom",
      status: "active",
      externalAccountId: "zoom-acc",
      externalAccountName: null,
      settings: { accountId: "zoom-acc" },
      secrets: { webhookSecretToken: `${userId}-token` },
      state: { legacyUpdatedAt },
      tokenObtainedAt: null,
      lastTokenRefreshAt: null,
      tokenInvalidAt: null,
      updatedAt: new Date(copiedAt),
      ...over,
    });

    it("picks the most recently updated config, not the most recent copy", async () => {
      process.env.CONNECTIONS_READ = "true";
      const prisma: any = {
        zoomConfig: { findMany: jest.fn().mockResolvedValue([]) },
        zoomWorkflowSettings: {
          findMany: jest.fn().mockResolvedValue([
            { userId: "user-a", autoUpload: true },
            { userId: "user-b", autoUpload: true },
            { userId: "user-c", autoUpload: false },
            { userId: "user-d", autoUpload: true },
          ]),
        },
      };
      const connections: any = {
        findByExternalAccount: jest.fn().mockResolvedValue([
          // Copied last by the backfill, but its config is the oldest
          view("user-a", "2026-09-10T00:00:00Z", "2026-09-25T00:00:05Z"),
          view("user-b", "2026-09-20T00:00:00Z", "2026-09-25T00:00:01Z"),
          // Newest config, but auto-upload is off
          view("user-c", "2026-09-22T00:00:00Z", "2026-09-25T00:00:02Z"),
          view("user-d", "2026-09-23T00:00:00Z", "2026-09-25T00:00:03Z", { status: "disabled" }),
        ]),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ZoomService,
          { provide: HttpService, useValue: {} },
          { provide: YoutubeService, useValue: {} },
          { provide: PrismaService, useValue: prisma },
          { provide: ConnectionReader, useValue: new ConnectionReader(prisma, connections) },
        ],
      }).compile();
      const zoom = module.get<ZoomService>(ZoomService);

      const { owner, account } = await zoom.findWebhookOwner("zoom-acc");
      expect(connections.findByExternalAccount).toHaveBeenCalledWith("zoom", "zoom-acc");
      expect(owner?.userId).toBe("user-b");
      expect(owner?.webhookSecretToken).toBe("user-b-token");
      // The token account ignores auto-upload: user-c is the newest active one
      expect(account?.userId).toBe("user-c");
    });
  });
});
