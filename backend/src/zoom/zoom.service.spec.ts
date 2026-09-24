import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ZoomService } from "./zoom.service";
import { YoutubeService } from "../youtube/youtube.service";
import { PrismaService } from "../prisma/prisma.service";

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
});
