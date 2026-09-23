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
});
