import { Test, TestingModule } from "@nestjs/testing";
import { YoutubeService } from "./youtube.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("YoutubeService", () => {
  let service: YoutubeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        { provide: PrismaService, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
      ],
    }).compile();

    service = module.get<YoutubeService>(YoutubeService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
