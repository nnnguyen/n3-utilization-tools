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
  UseGuards,
} from "@nestjs/common";
import { ZoomService } from "./zoom.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import * as crypto from "crypto";

@Controller("zoom")
export class ZoomController {
  private readonly logger = new Logger(ZoomController.name);

  constructor(private readonly zoomService: ZoomService) {}

  @Get("recordings")
  @UseGuards(JwtAuthGuard)
  async getRecordings(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page_size") pageSize?: number,
    @Query("next_page_token") nextPageToken?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.zoomService.listRecordings(user.id, {
      page_size: pageSize,
      next_page_token: nextPageToken,
      from,
      to,
    });
  }

  @Get("logs")
  @UseGuards(JwtAuthGuard)
  async getLogs(@CurrentUser() user: AuthenticatedUser) {
    return this.zoomService.getSyncLogs(user.id);
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

      return {
        status: "processing",
        event: "recording.completed",
        payload: payload.payload,
      };
    }

    return { status: "ignored" };
  }
}
