import { Test, TestingModule } from "@nestjs/testing";
import { ZoomController } from "./zoom.controller";
import { ZoomService } from "./zoom.service";
import { ZoomYoutubeMatchService } from "./youtube-match.service";

// @nestjs/axios v12 is ESM-only and Jest cannot require it; these tests never
// call Zoom, so a stand-in HttpService class is enough.
jest.mock("@nestjs/axios", () => ({ HttpService: class HttpService {} }));

describe("ZoomController", () => {
  let controller: ZoomController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ZoomController],
      providers: [
        { provide: ZoomService, useValue: {} },
        { provide: ZoomYoutubeMatchService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ZoomController>(ZoomController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
