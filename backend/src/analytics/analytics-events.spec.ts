import {
  ANALYTICS_EVENTS,
  durationBucket,
  sanitizeProperties,
  signupMethod,
  sizeBucket,
  stableUuid,
  syncTriggerOf,
} from "./analytics-events";

describe("analytics events", () => {
  it("never lists a property that could identify a person or leak a secret", () => {
    const risky = new Set(["email", "name", "title", "topic", "meeting", "url", "token", "secret", "password", "ip"]);
    for (const keys of Object.values(ANALYTICS_EVENTS)) {
      for (const key of keys) {
        for (const word of key.split("_")) expect(risky.has(word)).toBe(false);
      }
    }
  });

  it("keeps only the listed properties, with plain values", () => {
    expect(
      sanitizeProperties("sync_failed", {
        trigger: "webhook",
        error_code: "quotaExceeded",
        will_retry: false,
        email: "user@example.com",
        meeting: "SOH|Thực hành",
      } as any),
    ).toEqual({ trigger: "webhook", error_code: "quotaExceeded", will_retry: false });
    expect(
      sanitizeProperties("wordcloud_session_ended", {
        questions: 3,
        responses: Number.NaN,
        participants: { nested: 1 } as any,
      }),
    ).toEqual({ questions: 3 });
    expect(sanitizeProperties("youtube_authorized", { provider: "youtube" } as any)).toEqual({});
    expect((sanitizeProperties("recording_linked", { source: "x".repeat(200) }).source as string).length).toBe(64);
  });

  it("tells how a sync started from its log", () => {
    expect(syncTriggerOf({ event: "Manual Sync (Webhook)", autoRetryCount: 0 })).toBe("webhook");
    expect(syncTriggerOf({ event: "Manual Sync", autoRetryCount: 0 })).toBe("manual");
    expect(syncTriggerOf({ event: "Tự động retry lần 1/3", autoRetryCount: 1 })).toBe("retry");
    expect(syncTriggerOf({ event: null })).toBe("manual");
  });

  it("buckets durations and sizes", () => {
    expect(durationBucket(10 * 60)).toBe("<15m");
    expect(durationBucket(125 * 60)).toBe("2h+");
    expect(durationBucket(null)).toBeNull();
    expect(sizeBucket(BigInt(50 * 1024 * 1024))).toBe("<100MB");
    expect(sizeBucket(3 * 1024 ** 3)).toBe("2GB+");
    expect(sizeBucket(0)).toBeNull();
  });

  it("names the sign-up method", () => {
    expect(signupMethod({ googleId: "g", password: null })).toBe("google");
    expect(signupMethod({ googleId: "g", password: "hash" })).toBe("password");
    expect(signupMethod({ password: "hash", adminCreated: true })).toBe("admin_created");
  });

  it("builds the same valid UUID for the same seed", () => {
    const uuid = stableUuid("user_signed_up:user-1");
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid("user_signed_up:user-1")).toBe(uuid);
    expect(stableUuid("user_signed_up:user-2")).not.toBe(uuid);
  });
});
