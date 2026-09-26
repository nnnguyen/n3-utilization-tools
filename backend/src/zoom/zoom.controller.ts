import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
  Optional,
  Param,
  Put,
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
import { UpdateWorkflowSettingsDto } from "./workflow-settings.dto";
import { CaptionService } from "./caption.service";
import { AnalyticsService } from "../analytics/analytics.service";

@Controller("zoom")
export class ZoomController {
  private readonly logger = new Logger(ZoomController.name);

  constructor(
    private readonly zoomService: ZoomService,
    private readonly youtubeMatchService: ZoomYoutubeMatchService,
    private readonly captionService: CaptionService,
    @Optional() private readonly analytics?: AnalyticsService,
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

  // Upload (or re-upload) the Zoom transcript as captions of the synced video
  @Post("recordings/:recordingId/captions")
  @UseGuards(JwtAuthGuard)
  async uploadCaptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("recordingId") recordingId: string,
  ) {
    return this.captionService.uploadForUser(user.id, recordingId);
  }

  @Get("workflow-settings")
  @UseGuards(JwtAuthGuard)
  async getWorkflowSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.zoomService.getWorkflowSettings(user.id);
  }

  @Put("workflow-settings")
  @UseGuards(JwtAuthGuard)
  async updateWorkflowSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateWorkflowSettingsDto,
  ) {
    return this.zoomService.updateWorkflowSettings(user.id, body);
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
    const { owner, account } =
      await this.zoomService.findWebhookOwner(zoomAccountId);
    const envToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

    // Signed with the account's token or the env one (kept for compatibility)
    const verification = verifyZoomSignature(payload, timestamp, signature, [
      account?.webhookSecretToken,
      envToken,
    ]);
    if (verification === "invalid") {
      this.logger.error("Invalid Zoom webhook signature");
      return { status: "invalid signature" };
    }

    // Handle Zoom Webhook Validation (URL Validation)
    const validationToken = account?.webhookSecretToken || envToken;
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

    // Product analytics (P2-8b): for the account the event belongs to
    if (payload.event === "recording.completed" || payload.event === "recording.transcript_completed") {
      this.analytics?.capture(owner?.userId ?? account?.userId, "zoom_webhook_received", {
        event: payload.event,
        owner_found: !!owner,
        skipped_reason: payload.event === "recording.completed" && !owner && account ? "auto_upload_off" : null,
      });
    }

    if (payload.event === "recording.completed") {
      if (!owner && account) {
        // The accounts of this Zoom account turned auto-upload off
        this.logger.log(
          `Auto-upload is off for Zoom account ${zoomAccountId}; recording not synced`,
        );
        return { status: "skipped", event: "recording.completed" };
      }
      if (!owner) {
        this.logger.warn(
          `No active app account for Zoom account ${zoomAccountId ?? "(missing)"}; syncing as "system"`,
        );
      }
      // Process in background to avoid timeout
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

    if (payload.event === "recording.transcript_completed") {
      // Captions (P2-5): the sync log already names the account
      const object = payload.payload?.object ?? {};
      const recordingId: string | undefined = object.uuid || object.id?.toString();
      if (!recordingId) return { status: "ignored" };
      this.captionService
        .onTranscriptReady(recordingId)
        .catch((err) =>
          this.logger.error(`Error uploading captions for ${recordingId}`, err.stack),
        );
      return { status: "processing", event: "recording.transcript_completed" };
    }

    return { status: "ignored" };
  }
}
