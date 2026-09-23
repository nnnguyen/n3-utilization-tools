import { Test, TestingModule } from "@nestjs/testing";
import { YoutubeController } from "./youtube.controller";
import { YoutubeService } from "./youtube.service";
import { YoutubeStatsService } from "./youtube-stats.service";

describe("YoutubeController", () => {
  let controller: YoutubeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [YoutubeController],
      providers: [
        { provide: YoutubeService, useValue: {} },
        { provide: YoutubeStatsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<YoutubeController>(YoutubeController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
