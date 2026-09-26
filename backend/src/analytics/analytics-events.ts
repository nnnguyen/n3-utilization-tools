import { createHash } from "crypto";

// Product analytics events sent from the backend (docs/design/P2-8-posthog.md
// §3). Only these names, and for each only these properties (plain values),
// ever leave the app: no email, name, meeting title, URL or secret.
export const ANALYTICS_EVENTS = {
  user_signed_up: ["method"],
  connection_saved: ["provider", "active"],
  connection_disconnected: ["provider"],
  youtube_authorized: [],
  sync_started: ["trigger", "rule_matched"],
  sync_completed: ["trigger", "duration_bucket", "size_bucket", "scheduled"],
  sync_failed: ["trigger", "error_code", "will_retry"],
  zoom_webhook_received: ["event", "owner_found", "skipped_reason"],
  recording_linked: ["source"],
  captions_uploaded: ["language", "manual"],
  captions_failed: ["language", "error_code", "manual"],
  wordcloud_session_ended: ["questions", "participants", "responses"],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;

/** Keeps the listed properties with plain values; strings are capped. */
export function sanitizeProperties(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): Record<string, AnalyticsValue> {
  const allowed: readonly string[] = ANALYTICS_EVENTS[event];
  const clean: Record<string, AnalyticsValue> = {};
  for (const key of allowed) {
    const value = properties[key];
    if (value === undefined) continue;
    if (value === null || typeof value === "boolean") clean[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "string") clean[key] = value.slice(0, 64);
  }
  return clean;
}

export type SyncTrigger = "webhook" | "manual" | "retry";

/** How a sync attempt started, from its log ("Manual Sync (Webhook)", retries…). */
export function syncTriggerOf(log: { event?: string | null; autoRetryCount?: number | null }): SyncTrigger {
  if ((log.autoRetryCount ?? 0) > 0 || /retry/i.test(log.event ?? "")) return "retry";
  if (/webhook/i.test(log.event ?? "")) return "webhook";
  return "manual";
}

// Coarse buckets: enough for charts, nothing that identifies a meeting
export function durationBucket(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = seconds / 60;
  if (minutes < 15) return "<15m";
  if (minutes < 60) return "15-60m";
  if (minutes < 120) return "1-2h";
  return "2h+";
}

export function sizeBucket(bytes: number | bigint | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null;
  const mb = Number(bytes) / (1024 * 1024);
  if (!Number.isFinite(mb) || mb <= 0) return null;
  if (mb < 100) return "<100MB";
  if (mb < 500) return "100-500MB";
  if (mb < 2048) return "0.5-2GB";
  return "2GB+";
}

export function signupMethod(user: {
  googleId?: string | null;
  password?: string | null;
  adminCreated?: boolean;
}): "google" | "admin_created" | "password" {
  if (user.adminCreated) return "admin_created";
  if (user.googleId && !user.password) return "google";
  return "password";
}

/**
 * The same UUID for the same seed: PostHog keeps one copy of events sharing
 * uuid, distinct id, name and timestamp, so a repeated sign-up is not counted twice.
 */
export function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  // Shaped as a version 5 (name-based) UUID
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}
