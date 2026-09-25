import { YoutubeService } from "../youtube/youtube.service";
import { PROVIDERS } from "./providers";
import { quotaDate, tokenHealth, TokenHealthInput } from "./token-health";

const youtube = PROVIDERS.youtube.tokenPolicy;
const now = new Date("2026-09-25T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60_000);
const input = (over: Partial<TokenHealthInput> = {}): TokenHealthInput => ({
  active: true,
  hasToken: true,
  tokenObtainedAt: daysAgo(2),
  lastTokenRefreshAt: daysAgo(1),
  tokenInvalidAt: null,
  ...over,
});

describe("tokenHealth (same rules as YoutubeService.getTokenStatus)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("is not configured without an active token", () => {
    expect(tokenHealth(input({ hasToken: false }), youtube, now)).toEqual({
      configured: false,
      testingMode: true,
      tokenInvalid: false,
      expiringSoon: false,
    });
    expect(tokenHealth(input({ active: false }), youtube, now).configured).toBe(false);
  });

  it("counts the 7-day testing-mode lifetime from the authorization", () => {
    const health = tokenHealth(input(), youtube, now);
    expect(health).toMatchObject({
      configured: true,
      testingMode: true,
      expiresAt: new Date(daysAgo(2).getTime() + 7 * 24 * 60 * 60_000),
      daysRemaining: 5,
      expiringSoon: false,
      tokenInvalid: false,
    });
  });

  it("warns after YOUTUBE_TOKEN_WARN_AFTER_DAYS (default 5)", () => {
    expect(tokenHealth(input({ tokenObtainedAt: daysAgo(5) }), youtube, now)).toMatchObject({
      daysRemaining: 2,
      expiringSoon: true,
    });
    process.env.YOUTUBE_TOKEN_WARN_AFTER_DAYS = "6";
    expect(
      tokenHealth(input({ tokenObtainedAt: daysAgo(5) }), youtube, now).expiringSoon,
    ).toBe(false);
  });

  it("never reports more than 0 days remaining once expired", () => {
    expect(tokenHealth(input({ tokenObtainedAt: daysAgo(9) }), youtube, now)).toMatchObject({
      daysRemaining: 0,
    });
  });

  it("reports an invalid token instead of 'expiring soon'", () => {
    expect(
      tokenHealth(input({ tokenObtainedAt: daysAgo(6), tokenInvalidAt: daysAgo(0) }), youtube, now),
    ).toMatchObject({ tokenInvalid: true, expiringSoon: false });
  });

  it("has no expiry once the OAuth app is published", () => {
    process.env.YOUTUBE_OAUTH_TESTING_MODE = "false";
    expect(tokenHealth(input({ tokenObtainedAt: daysAgo(30) }), youtube, now)).toMatchObject({
      testingMode: false,
      expiresAt: null,
      daysRemaining: null,
      expiringSoon: false,
    });
  });

  it("never expires for providers without a token policy (Zoom)", () => {
    expect(tokenHealth(input(), PROVIDERS.zoom.tokenPolicy, now)).toMatchObject({
      configured: true,
      testingMode: false,
      expiresAt: null,
    });
  });
});

describe("quotaDate", () => {
  it("uses the provider's reset time zone", () => {
    // 05:00 UTC is still the previous day in Los Angeles
    const at = new Date("2026-09-25T05:00:00Z");
    expect(quotaDate(at, "America/Los_Angeles")).toBe("2026-09-24");
    expect(quotaDate(at, "UTC")).toBe("2026-09-25");
  });
});

describe("tokenHealth matches YoutubeService.getTokenStatus", () => {
  const cases: Record<string, Partial<TokenHealthInput>> = {
    fresh: { tokenObtainedAt: new Date(Date.now() - 2 * 86_400_000) },
    expiringSoon: { tokenObtainedAt: new Date(Date.now() - 5.5 * 86_400_000) },
    expired: { tokenObtainedAt: new Date(Date.now() - 9 * 86_400_000) },
    invalid: { tokenInvalidAt: new Date() },
    noObtainedAt: { tokenObtainedAt: null },
    inactive: { active: false },
    noToken: { hasToken: false },
  };

  for (const [name, over] of Object.entries(cases)) {
    it(name, async () => {
      const i = input(over);
      const prisma = {
        youtubeConfig: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: i.active,
            refreshToken: i.hasToken ? "tok" : null,
            tokenObtainedAt: i.tokenObtainedAt,
            lastTokenRefreshAt: i.lastTokenRefreshAt,
            tokenInvalidAt: i.tokenInvalidAt,
          }),
        },
      };
      const legacy = await new YoutubeService(prisma as any, {} as any, {} as any, {
        youtubeConfig: (userId: string) => prisma.youtubeConfig.findUnique({ where: { userId } }),
      } as any).getTokenStatus("user-1");
      // Same instant for both: getTokenStatus reads the clock itself
      const health = tokenHealth(i, youtube, new Date());
      expect(health).toEqual(legacy);
    });
  }
});
