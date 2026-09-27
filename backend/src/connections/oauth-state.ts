import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// OAuth `state` for callbacks that arrive without the user's session (Google
// redirects to the backend, cookies may be blocked): which account and app,
// signed with JWT_SECRET so it cannot be forged, and short-lived.

const STATE_TTL_MS = 15 * 60_000;

export interface OAuthState {
  userId: string;
  provider: string;
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`oauth-state:${payload}`).digest("base64url");
}

export function createOAuthState(state: OAuthState, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ u: state.userId, p: state.provider, e: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The state's account and app, or null if forged, altered or expired. */
export function verifyOAuthState(value: string | undefined, provider: string, now = Date.now()): OAuthState | null {
  const [payload, signature, extra] = (value ?? "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.p !== provider || typeof data.u !== "string" || !(data.e > now)) return null;
    return { userId: data.u, provider: data.p };
  } catch {
    return null;
  }
}
