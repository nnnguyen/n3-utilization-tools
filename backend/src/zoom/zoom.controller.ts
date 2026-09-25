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
import { SyncRecordingDto } from "./sync-recording.dto";
import { DismissMatchDto, LinkRecordingDto, UnlinkRecordingDto } from "./youtube-link.dto";
import { ZoomYoutubeMatchService } from "./youtube-match.service";
import * as crypto from "crypto";
import { verifyZoomSignature } from "./webhook-owner";

@Controller("zoom")
export class ZoomController {
  private readonly logger = new Logger(ZoomController.name);

  constructor(
    private readonly zoomService: ZoomService,
    private readonly youtubeMatchService: ZoomYoutubeMatchService,
  ) {}

  @Get("recordings")
  @UseGuards(JwtAuthGuard)
  async getRecordings(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page_size") pageSize?: number,
    @Query("next_page_token") nextPageToken?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const result = await this.zoomService.listRecordings(user.id, {
      page_size: pageSize,
      next_page_token: nextPageToken,
      from,
      to,
    });
    // Recordings the app has no sync record of may already be on YouTube:
    // suggest the matching channel video (a suggestion never breaks the list)
    try {
      result.meetings = await this.youtubeMatchService.attachMatches(user.id, result.meetings || []);
    } catch (error) {
      this.logger.warn(`YouTube match suggestions failed: ${error.message}`);
    }
    return result;
  }

  // Mark a recording as already on YouTube as the given channel video
  @Post("recordings/link")
  @UseGuards(JwtAuthGuard)
  async linkRecording(@CurrentUser() user: AuthenticatedUser, @Body() body: LinkRecordingDto) {
    return this.youtubeMatchService.link(user.id, body);
  }

  @Post("recordings/unlink")
  @UseGuards(JwtAuthGuard)
  async unlinkRecording(@CurrentUser() user: AuthenticatedUser, @Body() body: UnlinkRecordingDto) {
    return this.youtubeMatchService.unlink(user.id, body.recordingId);
  }

  @Post("recordings/dismiss-match")
  @UseGuards(JwtAuthGuard)
  async dismissMatch(@CurrentUser() user: AuthenticatedUser, @Body() body: DismissMatchDto) {
    return this.youtubeMatchService.dismiss(user.id, body.recordingId, body.videoId);
  }

  @Get("logs")
  @UseGuards(JwtAuthGuard)
  async getLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query("recordingId") recordingId?: string,
  ) {
    return this.zoomService.getSyncLogs(user.id, recordingId);
  }

  @Post("sync")
  @UseGuards(JwtAuthGuard)
  async syncRecording(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SyncRecordingDto,
  ) {
    this.logger.log(`Manual sync requested for recording: ${body.recordingId}`);

    // We run it in background
    this.zoomService
      .syncRecording(
        user.id,
        body.recordingId,
        body.topic,
        body.startTime,
        body.privacyStatus,
        body.playlistId,
      )
      .then((result) => {
        if (result) {
          this.logger.log(
            `Manual sync completed for ${body.recordingId}: YouTube ID ${result.id}`,
          );
        } else {
          this.logger.warn(
            `Manual sync finished for ${body.recordingId} but no video was uploaded.`,
          );
        }
      })
      .catch((err) =>
        this.logger.error(
          `Manual sync failed for ${body.recordingId}`,
          err.stack,
        ),
      );

    return { status: "Processing", recordingId: body.recordingId };
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers("x-zm-signature") signature: string,
    @Headers("x-zm-request-timestamp") timestamp: string,
  ) {
    this.logger.log(`Received Zoom webhook: ${payload.event}`);

    // The Zoom account id tells which app account owns this webhook
    const zoomAccountId: string | undefined = payload.payload?.account_id;
    const owner = await this.zoomService.findWebhookOwner(zoomAccountId);
    const envToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

    // Signed with the owner's token or the env one (kept for compatibility)
    const verification = verifyZoomSignature(payload, timestamp, signature, [
      owner?.webhookSecretToken,
      envToken,
    ]);
    if (verification === "invalid") {
      this.logger.error("Invalid Zoom webhook signature");
      return { status: "invalid signature" };
    }

    // Handle Zoom Webhook Validation (URL Validation)
    const validationToken = owner?.webhookSecretToken || envToken;
    if (payload.event === "endpoint.url_validation" && validationToken) {
      const plainToken = payload.payload.plainToken;
      const hashForValidate = crypto
        .createHmac("sha256", validationToken)
        .update(plainToken)
        .digest("hex");

      return {
        plainToken: plainToken,
        encryptedToken: hashForValidate,
      };
    }

    if (payload.event === "recording.completed") {
      // Process in background to avoid timeout
      if (!owner) {
        this.logger.warn(
          `No active app account for Zoom account ${zoomAccountId ?? "(missing)"}; syncing as "system"`,
        );
      }
      this.zoomService
        .handleRecordingCompleted(payload.payload, owner?.userId)
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
