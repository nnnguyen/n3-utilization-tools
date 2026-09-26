import { Test, TestingModule } from "@nestjs/testing";
import { ZoomController } from "./zoom.controller";
import { ZoomService } from "./zoom.service";
import { ZoomYoutubeMatchService } from "./youtube-match.service";
import { zoomSignature } from "./webhook-owner";
import { CaptionService } from "./caption.service";

// @nestjs/axios v12 is ESM-only and Jest cannot require it; these tests never
// call Zoom, so a stand-in HttpService class is enough.
jest.mock("@nestjs/axios", () => ({ HttpService: class HttpService {} }));

describe("ZoomController", () => {
  let controller: ZoomController;
  const captionService = { onTranscriptReady: jest.fn().mockResolvedValue({ status: "uploaded" }) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ZoomController],
      providers: [
        { provide: ZoomService, useValue: {} },
        { provide: ZoomYoutubeMatchService, useValue: {} },
        { provide: CaptionService, useValue: captionService },
      ],
    }).compile();

    controller = module.get<ZoomController>(ZoomController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("handleWebhook", () => {
    const timestamp = "1758790000";
    const recordingPayload = {
      event: "recording.completed",
      payload: { account_id: "zoom-acc", object: { uuid: "rec-1" } },
    };
    let zoomService: {
      findWebhookOwner: jest.Mock;
      handleRecordingCompleted: jest.Mock;
    };
    let webhookController: ZoomController;
    const envToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

    beforeEach(async () => {
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN = "env-token";
      zoomService = {
        findWebhookOwner: jest.fn().mockResolvedValue({
          owner: { userId: "owner-1", webhookSecretToken: "owner-token" },
          account: { userId: "owner-1", webhookSecretToken: "owner-token" },
        }),
        handleRecordingCompleted: jest.fn().mockResolvedValue(undefined),
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ZoomController],
        providers: [
          { provide: ZoomService, useValue: zoomService },
          { provide: ZoomYoutubeMatchService, useValue: {} },
          { provide: CaptionService, useValue: captionService },
        { provide: CaptionService, useValue: captionService },
        ],
      }).compile();
      webhookController = module.get<ZoomController>(ZoomController);
    });

    afterEach(() => {
      if (envToken === undefined) delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      else process.env.ZOOM_WEBHOOK_SECRET_TOKEN = envToken;
    });

    it("syncs a recording as the owner of the Zoom account", async () => {
      const signature = zoomSignature("owner-token", timestamp, recordingPayload);
      const result = await webhookController.handleWebhook(
        recordingPayload,
        signature,
        timestamp,
      );
      expect(result.status).toBe("processing");
      expect(zoomService.findWebhookOwner).toHaveBeenCalledWith("zoom-acc");
      expect(zoomService.handleRecordingCompleted).toHaveBeenCalledWith(
        recordingPayload.payload,
        "owner-1",
      );
    });

    it("still accepts the env token", async () => {
      const signature = zoomSignature("env-token", timestamp, recordingPayload);
      const result = await webhookController.handleWebhook(
        recordingPayload,
        signature,
        timestamp,
      );
      expect(result.status).toBe("processing");
    });

    it("rejects a signature matching neither token", async () => {
      const signature = zoomSignature("wrong", timestamp, recordingPayload);
      const result = await webhookController.handleWebhook(
        recordingPayload,
        signature,
        timestamp,
      );
      expect(result).toEqual({ status: "invalid signature" });
      expect(zoomService.handleRecordingCompleted).not.toHaveBeenCalled();
    });

    it('falls back to "system" when no owner is found', async () => {
      zoomService.findWebhookOwner.mockResolvedValue({ owner: null, account: null });
      const signature = zoomSignature("env-token", timestamp, recordingPayload);
      await webhookController.handleWebhook(recordingPayload, signature, timestamp);
      expect(zoomService.handleRecordingCompleted).toHaveBeenCalledWith(
        recordingPayload.payload,
        undefined,
      );
    });

    it("skips the recording when the account turned auto-upload off", async () => {
      zoomService.findWebhookOwner.mockResolvedValue({
        owner: null,
        account: { userId: "owner-1", webhookSecretToken: "owner-token" },
      });
      const signature = zoomSignature("owner-token", timestamp, recordingPayload);
      const result = await webhookController.handleWebhook(
        recordingPayload,
        signature,
        timestamp,
      );
      expect(result.status).toBe("skipped");
      expect(zoomService.handleRecordingCompleted).not.toHaveBeenCalled();
    });

    it("uploads captions when Zoom finishes a transcript", async () => {
      const transcript = {
        event: "recording.transcript_completed",
        payload: { account_id: "zoom-acc", object: { uuid: "rec-9" } },
      };
      const signature = zoomSignature("owner-token", timestamp, transcript);
      const result = await webhookController.handleWebhook(transcript, signature, timestamp);
      expect(result.status).toBe("processing");
      expect(captionService.onTranscriptReady).toHaveBeenCalledWith("rec-9");
      // An unsigned or badly signed one is refused like any webhook
      captionService.onTranscriptReady.mockClear();
      await webhookController.handleWebhook(transcript, zoomSignature("wrong", timestamp, transcript), timestamp);
      expect(captionService.onTranscriptReady).not.toHaveBeenCalled();
    });

    it("answers URL validation with the env token when no account is known", async () => {
      zoomService.findWebhookOwner.mockResolvedValue({ owner: null, account: null });
      const validation = {
        event: "endpoint.url_validation",
        payload: { plainToken: "plain" },
      };
      const signature = zoomSignature("env-token", timestamp, validation);
      const result: any = await webhookController.handleWebhook(
        validation,
        signature,
        timestamp,
      );
      expect(result.plainToken).toBe("plain");
      expect(result.encryptedToken).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
