import { createOAuthState, verifyOAuthState } from "./oauth-state";

describe("OAuth state", () => {
  const env = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = "test-secret"));
  afterAll(() => (process.env.JWT_SECRET = env));

  it("round-trips the account and app", () => {
    const state = createOAuthState({ userId: "user-1", provider: "google_drive" });
    expect(verifyOAuthState(state, "google_drive")).toEqual({ userId: "user-1", provider: "google_drive" });
  });

  it("refuses another app, an altered or unsigned state", () => {
    const state = createOAuthState({ userId: "user-1", provider: "google_drive" });
    expect(verifyOAuthState(state, "youtube")).toBeNull();
    const [payload, signature] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user-2", p: "google_drive", e: Date.now() + 60_000 })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${signature}`, "google_drive")).toBeNull();
    expect(verifyOAuthState(payload, "google_drive")).toBeNull();
    expect(verifyOAuthState("user-1", "google_drive")).toBeNull();
    expect(verifyOAuthState(undefined, "google_drive")).toBeNull();
  });

  it("expires after 15 minutes", () => {
    const now = Date.now();
    const state = createOAuthState({ userId: "user-1", provider: "google_drive" }, now);
    expect(verifyOAuthState(state, "google_drive", now + 14 * 60_000)).not.toBeNull();
    expect(verifyOAuthState(state, "google_drive", now + 16 * 60_000)).toBeNull();
  });

  it("does not verify with another secret", () => {
    const state = createOAuthState({ userId: "user-1", provider: "google_drive" });
    process.env.JWT_SECRET = "other-secret";
    expect(verifyOAuthState(state, "google_drive")).toBeNull();
    process.env.JWT_SECRET = "test-secret";
  });
});
