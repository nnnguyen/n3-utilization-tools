import { AnalyticsService } from "./analytics.service";

// capture() sends in the background
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AnalyticsService", () => {
  let prisma: any;
  let client: { capture: jest.Mock; shutdown: jest.Mock };
  let service: AnalyticsService;
  let consent: boolean | null;

  beforeEach(() => {
    consent = true;
    prisma = {
      user: { findUnique: jest.fn(async () => ({ analyticsConsent: consent })) },
      activityLog: { count: jest.fn().mockResolvedValue(0) },
    };
    client = { capture: jest.fn(), shutdown: jest.fn() };
    service = new AnalyticsService(prisma);
    // Tests never reach PostHog: a stand-in client
    (service as any).client = client;
  });

  it("does nothing without POSTHOG_API_KEY", async () => {
    const disabled = new AnalyticsService(prisma);
    expect(disabled.enabled).toBe(false);
    disabled.capture("user-1", "youtube_authorized");
    await settle();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("sends listed properties only, for an account that agreed", async () => {
    service.capture("user-1", "connection_saved", { provider: "zoom", active: true, email: "a@b.c" } as any);
    await settle();
    expect(client.capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "connection_saved",
      properties: { provider: "zoom", active: true },
    });
  });

  it.each([null, false])("sends nothing (and runs no query) when consent is %s", async (value) => {
    consent = value;
    const properties = jest.fn(async () => ({ trigger: "manual" }));
    service.capture("user-1", "sync_started", properties);
    await settle();
    expect(client.capture).not.toHaveBeenCalled();
    expect(properties).not.toHaveBeenCalled();
  });

  it("skips the system account and missing ids", async () => {
    service.capture("system", "youtube_authorized");
    service.capture(undefined, "youtube_authorized");
    await settle();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("never throws, even when PostHog or the properties fail", async () => {
    client.capture.mockImplementation(() => {
      throw new Error("network");
    });
    expect(() => service.capture("user-1", "youtube_authorized")).not.toThrow();
    service.capture("user-1", "sync_started", async () => {
      throw new Error("db down");
    });
    await settle();
  });

  it("remembers the consent for a while", async () => {
    service.capture("user-1", "youtube_authorized");
    service.capture("user-1", "youtube_authorized");
    await settle();
    service.capture("user-1", "youtube_authorized");
    await settle();
    expect(prisma.user.findUnique.mock.calls.length).toBeLessThanOrEqual(2);
    expect(client.capture).toHaveBeenCalledTimes(3);
  });

  it("counts the sign-up once, at its real time, when the account agrees", async () => {
    const createdAt = new Date("2026-09-01T08:00:00Z");
    prisma.activityLog.count.mockResolvedValue(1);
    service.consentChanged({ id: "user-1", analyticsConsent: true, password: "hash", createdAt });
    await settle();
    await settle();
    expect(client.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "user-1",
        event: "user_signed_up",
        properties: { method: "admin_created" },
        timestamp: createdAt,
        uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
    // Uses the new answer at once, without reading it again
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("stops at once when the account withdraws", async () => {
    service.consentChanged({ id: "user-1", analyticsConsent: false, createdAt: new Date() });
    service.capture("user-1", "youtube_authorized");
    await settle();
    expect(client.capture).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("sends what is queued on shutdown", async () => {
    await service.onApplicationShutdown();
    expect(client.shutdown).toHaveBeenCalled();
  });
});
