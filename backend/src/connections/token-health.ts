import type { TokenPolicy } from "./providers";

const DAY_MS = 24 * 60 * 60_000;

export interface TokenHealthInput {
  active: boolean;
  // The provider's "connected" secret is stored (e.g. a refresh token)
  hasToken: boolean;
  tokenObtainedAt: Date | null;
  lastTokenRefreshAt: Date | null;
  tokenInvalidAt: Date | null;
}

export type TokenHealth =
  | {
      configured: false;
      testingMode: boolean;
      tokenInvalid: false;
      expiringSoon: false;
    }
  | {
      configured: true;
      testingMode: boolean;
      tokenObtainedAt: Date | null;
      lastTokenRefreshAt: Date | null;
      expiresAt: Date | null;
      daysRemaining: number | null;
      tokenInvalid: boolean;
      tokenInvalidAt: Date | null;
      expiringSoon: boolean;
    };

/**
 * Connection health from stored bookkeeping only (no API call), generalised
 * from YoutubeService.getTokenStatus: same fields and rules. Providers without
 * a token policy never expire.
 */
export function tokenHealth(
  input: TokenHealthInput,
  policy: TokenPolicy | null,
  now = new Date(),
): TokenHealth {
  const testingMode = policy?.testingMode() ?? false;
  if (!input.active || !input.hasToken) {
    return { configured: false, testingMode, tokenInvalid: false, expiringSoon: false };
  }

  let expiresAt: Date | null = null;
  let daysRemaining: number | null = null;
  let expiringSoon = false;
  if (policy && testingMode && input.tokenObtainedAt) {
    const obtained = input.tokenObtainedAt.getTime();
    expiresAt = new Date(obtained + policy.testingLifetimeDays * DAY_MS);
    daysRemaining = Math.max(
      0,
      Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS),
    );
    expiringSoon = now.getTime() - obtained >= policy.warnAfterDays() * DAY_MS;
  }

  return {
    configured: true,
    testingMode,
    tokenObtainedAt: input.tokenObtainedAt,
    lastTokenRefreshAt: input.lastTokenRefreshAt,
    expiresAt,
    daysRemaining,
    tokenInvalid: !!input.tokenInvalidAt,
    tokenInvalidAt: input.tokenInvalidAt,
    expiringSoon: expiringSoon && !input.tokenInvalidAt,
  };
}

/** The provider's quota day (YYYY-MM-DD) at `now` in its reset time zone. */
export function quotaDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
