import {
  resolveWebhookAccounts,
  selectWebhookOwner,
  verifyZoomSignature,
  WebhookOwnerCandidate,
  zoomSignature,
} from "./webhook-owner";

const candidate = (
  over: Partial<WebhookOwnerCandidate> = {},
): WebhookOwnerCandidate => ({
  userId: "user-1",
  isActive: true,
  updatedAt: new Date("2026-09-01T00:00:00Z"),
  webhookSecretToken: "user-token",
  autoUpload: true,
  ...over,
});

describe("selectWebhookOwner", () => {
  it("returns null when no account is configured with that Zoom account", () => {
    expect(selectWebhookOwner([])).toBeNull();
  });

  it("returns null when every candidate is inactive or has auto-upload off", () => {
    expect(
      selectWebhookOwner([
        candidate({ isActive: false }),
        candidate({ userId: "user-2", autoUpload: false }),
      ]),
    ).toBeNull();
  });

  it("treats an account without saved settings as auto-upload off (the default)", () => {
    const result = resolveWebhookAccounts([candidate({ autoUpload: undefined })]);
    expect(result.owner).toBeNull();
    // Still the account whose webhook token verifies the request
    expect(result.account?.userId).toBe("user-1");
  });

  it("returns the single active account", () => {
    expect(
      selectWebhookOwner([
        candidate({ userId: "inactive", isActive: false }),
        candidate({ userId: "owner" }),
      ])?.userId,
    ).toBe("owner");
  });

  it("picks the most recently updated config among several", () => {
    expect(
      selectWebhookOwner([
        candidate({ userId: "old", updatedAt: new Date("2026-08-01") }),
        candidate({ userId: "newest", updatedAt: new Date("2026-09-20") }),
        candidate({ userId: "mid", updatedAt: new Date("2026-09-10") }),
        // Newer but auto-upload off (P1-4): not eligible
        candidate({
          userId: "off",
          updatedAt: new Date("2026-09-24"),
          autoUpload: false,
        }),
      ])?.userId,
    ).toBe("newest");
  });
});

describe("resolveWebhookAccounts", () => {
  it("keeps the account (for its webhook token) when auto-upload is off everywhere", () => {
    const result = resolveWebhookAccounts([
      candidate({ userId: "off", autoUpload: false }),
      candidate({ userId: "inactive", isActive: false, updatedAt: new Date("2026-09-24") }),
    ]);
    expect(result.owner).toBeNull();
    expect(result.account?.userId).toBe("off");
  });

  it("returns nothing when no account is active", () => {
    expect(resolveWebhookAccounts([candidate({ isActive: false })])).toEqual({
      owner: null,
      account: null,
    });
  });
});

describe("verifyZoomSignature", () => {
  const payload = { event: "recording.completed", payload: { account_id: "acc" } };
  const timestamp = "1758790000";

  it("accepts a signature made with the account's own token", () => {
    const signature = zoomSignature("user-token", timestamp, payload);
    expect(
      verifyZoomSignature(payload, timestamp, signature, ["user-token", "env-token"]),
    ).toBe("valid");
  });

  it("accepts a signature made with the env token", () => {
    const signature = zoomSignature("env-token", timestamp, payload);
    expect(
      verifyZoomSignature(payload, timestamp, signature, ["user-token", "env-token"]),
    ).toBe("valid");
  });

  it("rejects a signature made with another secret", () => {
    const signature = zoomSignature("other", timestamp, payload);
    expect(
      verifyZoomSignature(payload, timestamp, signature, ["user-token", "env-token"]),
    ).toBe("invalid");
  });

  it("rejects a missing signature when a secret is configured", () => {
    expect(
      verifyZoomSignature(payload, timestamp, undefined, [null, "env-token"]),
    ).toBe("invalid");
  });

  it("rejects a tampered payload", () => {
    const signature = zoomSignature("env-token", timestamp, payload);
    expect(
      verifyZoomSignature({ ...payload, event: "x" }, timestamp, signature, ["env-token"]),
    ).toBe("invalid");
  });

  it("reports unsigned when no secret is configured", () => {
    expect(verifyZoomSignature(payload, timestamp, undefined, [null, undefined, ""])).toBe(
      "unsigned",
    );
  });
});
