import { QuotaService } from "./quota.service";

describe("QuotaService", () => {
  const env = { ...process.env };
  let prisma: any;
  let service: QuotaService;

  beforeEach(() => {
    prisma = {
      quotaUsage: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ unitsUsed: 3300 }),
      },
    };
    service = new QuotaService(prisma);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("tracks YouTube units on the Pacific quota day", async () => {
    await service.track("user-1", "youtube", 1650, new Date("2026-09-25T05:00:00Z"));
    expect(prisma.quotaUsage.upsert).toHaveBeenCalledWith({
      where: { userId_provider_date: { userId: "user-1", provider: "youtube", date: "2026-09-24" } },
      update: { unitsUsed: { increment: 1650 } },
      create: { userId: "user-1", provider: "youtube", date: "2026-09-24", unitsUsed: 1650 },
    });
  });

  it("ignores providers without a quota and the system user", async () => {
    await service.track("user-1", "zoom", 5);
    await service.track("system", "youtube", 5);
    expect(prisma.quotaUsage.upsert).not.toHaveBeenCalled();
    expect(await service.status("user-1", "zoom")).toBeNull();
  });

  it("never throws when bookkeeping fails", async () => {
    prisma.quotaUsage.upsert.mockRejectedValue(new Error("db down"));
    await expect(service.track("user-1", "youtube", 5)).resolves.toBeUndefined();
  });

  it("reports today's usage against YOUTUBE_QUOTA_LIMIT", async () => {
    process.env.YOUTUBE_QUOTA_LIMIT = "5000";
    expect(
      await service.status("user-1", "youtube", new Date("2026-09-25T12:00:00Z")),
    ).toEqual({ unitsUsed: 3300, unitsRemaining: 1700, quotaLimit: 5000, date: "2026-09-25" });
  });
});
