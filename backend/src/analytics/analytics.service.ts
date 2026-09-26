import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { PostHog } from "posthog-node";
import { PrismaService } from "../prisma/prisma.service";
import {
  AnalyticsEvent,
  AnalyticsProperties,
  sanitizeProperties,
  signupMethod,
  stableUuid,
} from "./analytics-events";

// A user's consent is re-read at most this often (it changes rarely, and
// consentChanged() updates it at once on this instance)
const CONSENT_TTL_MS = 60_000;

type LazyProperties = AnalyticsProperties | (() => Promise<AnalyticsProperties>);

/**
 * Backend product analytics (P2-8b, docs/design/P2-8-posthog.md): sends the
 * events of analytics-events.ts to PostHog for accounts that agreed
 * (User.analyticsConsent). Without POSTHOG_API_KEY it does nothing. Sending is
 * batched in the background: callers never wait for PostHog and nothing here
 * ever throws.
 */
@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly client: PostHog | null;
  private readonly consent = new Map<string, { value: boolean; at: number }>();

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.POSTHOG_API_KEY;
    this.client =
      apiKey && process.env.NODE_ENV !== "test"
        ? new PostHog(apiKey, {
            host: process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
            // The server's own location says nothing about the user
            disableGeoip: true,
          })
        : null;
  }

  get enabled() {
    return this.client !== null;
  }

  /**
   * Sends `event` for `userId` if the account agreed. `properties` may be a
   * function: it only runs (e.g. extra queries) when the event is sent.
   */
  capture(
    userId: string | null | undefined,
    event: AnalyticsEvent,
    properties?: LazyProperties,
    options: { timestamp?: Date; uuid?: string } = {},
  ): void {
    if (!this.client || !userId || userId === "system") return;
    void this.send(userId, event, properties, options);
  }

  /** After Settings → Personalization or the consent prompt saved an answer. */
  consentChanged(user: {
    id: string;
    analyticsConsent: boolean | null;
    googleId?: string | null;
    password?: string | null;
    createdAt: Date;
  }): void {
    this.consent.set(user.id, { value: user.analyticsConsent === true, at: Date.now() });
    if (user.analyticsConsent !== true) return;
    // Sign-up happens before anyone can agree: counted once, at its real time
    this.capture(
      user.id,
      "user_signed_up",
      async () => ({
        method: signupMethod({
          ...user,
          adminCreated:
            (await this.prisma.activityLog.count({
              where: { action: "admin.user.created", targetId: user.id },
            })) > 0,
        }),
      }),
      { timestamp: user.createdAt, uuid: stableUuid(`user_signed_up:${user.id}`) },
    );
  }

  private async send(
    userId: string,
    event: AnalyticsEvent,
    properties: LazyProperties | undefined,
    options: { timestamp?: Date; uuid?: string },
  ) {
    try {
      if (!(await this.hasConsent(userId))) return;
      const values = typeof properties === "function" ? await properties() : properties;
      this.client!.capture({
        distinctId: userId,
        event,
        properties: sanitizeProperties(event, values),
        ...options,
      });
    } catch (error) {
      this.logger.warn(`Analytics event ${event} not sent: ${error?.message}`);
    }
  }

  private async hasConsent(userId: string): Promise<boolean> {
    const cached = this.consent.get(userId);
    if (cached && Date.now() - cached.at < CONSENT_TTL_MS) return cached.value;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { analyticsConsent: true },
    });
    const value = user?.analyticsConsent === true;
    this.consent.set(userId, { value, at: Date.now() });
    return value;
  }

  async onApplicationShutdown() {
    try {
      // Sends what is still queued
      await this.client?.shutdown();
    } catch (error) {
      this.logger.warn(`PostHog shutdown failed: ${error?.message}`);
    }
  }
}
