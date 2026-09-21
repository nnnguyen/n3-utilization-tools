import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
  Query,
} from "@nestjs/common";
import { ZoomService } from "./zoom.service";
import * as crypto from "crypto";

@Controller("zoom")
export class ZoomController {
  private readonly logger = new Logger(ZoomController.name);

  constructor(private readonly zoomService: ZoomService) {}

  @Get("recordings")
  async getRecordings(@Query("userId") userId?: string) {
    if (
      !process.env.ZOOM_CLIENT_ID ||
      !process.env.ZOOM_CLIENT_SECRET ||
      !process.env.ZOOM_ACCOUNT_ID
    ) {
      return { meetings: [] }; // Return empty if not configured to avoid 500
    }
    return this.zoomService.listRecordings(userId || "me");
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers("x-zm-signature") signature: string,
    @Headers("x-zm-request-timestamp") timestamp: string,
  ) {
    this.logger.log(`Received Zoom webhook: ${payload.event}`);

    // Verification of Zoom webhook signature (Recommended for production)
    if (process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
      const message = `v0:${timestamp}:${JSON.stringify(payload)}`;
      const hash = crypto
        .createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
        .update(message)
        .digest("hex");
      const expectedSignature = `v0=${hash}`;

      if (signature !== expectedSignature) {
        this.logger.error("Invalid Zoom webhook signature");
        return { status: "invalid signature" };
      }
    }

    // Handle Zoom Webhook Validation (URL Validation)
    if (
      payload.event === "endpoint.url_validation" &&
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN
    ) {
      const plainToken = payload.payload.plainToken;
      const hashForValidate = crypto
        .createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
        .update(plainToken)
        .digest("hex");

      return {
        plainToken: plainToken,
        encryptedToken: hashForValidate,
      };
    }

    if (payload.event === "recording.completed") {
      // Process in background to avoid timeout
      this.zoomService
        .handleRecordingCompleted(payload.payload)
        .catch((err) =>
          this.logger.error(
            "Error processing recording in background",
            err.stack,
          ),
        );

      return { status: "processing" };
    }

    return { status: "ignored" };
  }
}
