import * as crypto from "crypto";
import { ConnectionsService } from "./connections.service";
import { LegacyMirrorService } from "./legacy-mirror.service";

const zoomRow = (over: any = {}) => ({
  id: "z1",
  userId: "user-1",
  accountId: "zoom-acc",
  clientId: "zoom-client",
  clientSecret: "zoom-secret",
  webhookSecretToken: "",
  isActive: true,
  updatedAt: new Date("2026-09-20T00:00:00Z"),
  ...over,
});

const youtubeRow = (over: any = {}) => ({
  id: "y1",
  userId: "user-1",
  clientId: "yt-client",
  clientSecret: "yt-secret",
  refreshToken: "yt-refresh",
  isActive: true,
  updatedAt: new Date("2026-09-20T00:00:00Z"),
  tokenObtainedAt: new Date("2026-09-19T00:00:00Z"),
  lastTokenRefreshAt: new Date("2026-09-20T00:00:00Z"),
  tokenInvalidAt: null,
  channelVideosFetchedAt: new Date("2026-09-20T01:00:00Z"),
  ...over,
});

function fakePrisma() {
  const connections = new Map<string, any>();
  const quota = new Map<string, any>();
  const legacy = {
    zoom: [zoomRow()],
    youtube: [youtubeRow()],
    quota: [{ userId: "user-1", date: "2026-09-24", unitsUsed: 3300 }],
  };
  let clock = new Date("2026-09-25T00:00:00Z").getTime();
  const prisma: any = {
    connections,
    quota,
    legacy,
    zoomConfig: {
      findMany: jest.fn(async () => legacy.zoom),
      findUnique: jest.fn(async ({ where }) => legacy.zoom.find((r) => r.userId === where.userId) ?? null),
    },
    youtubeConfig: {
      findMany: jest.fn(async () => legacy.youtube),
      findUnique: jest.fn(async ({ where }) => legacy.youtube.find((r) => r.userId === where.userId) ?? null),
    },
    youtubeQuotaUsage: {
      findMany: jest.fn(async () => legacy.quota),
      findUnique: jest.fn(async ({ where }) =>
        legacy.quota.find((r) => r.userId === where.userId_date.userId && r.date === where.userId_date.date) ?? null,
      ),
    },
    connection: {
      findMany: jest.fn(async () => [...connections.values()]),
      findUnique: jest.fn(async ({ where }) =>
        connections.get(`${where.userId_provider.userId}:${where.userId_provider.provider}`) ?? null,
      ),
      upsert: jest.fn(async ({ where, update, create }) => {
        const k = `${where.userId_provider.userId}:${where.userId_provider.provider}`;
        const row = { id: k, ...(connections.get(k) ?? create), ...update, updatedAt: new Date((clock += 1000)) };
        connections.set(k, row);
        return row;
      }),
    },
    quotaUsage: {
      upsert: jest.fn(async ({ where, update, create }) => {
        const w = where.userId_provider_date;
        const k = `${w.userId}:${w.provider}:${w.date}`;
        quota.set(k, { ...(quota.get(k) ?? create), ...update });
      }),
    },
    $transaction: jest.fn(async (fn) => fn({ $queryRaw: jest.fn(async () => [{ locked: true }]) })),
  };
  return prisma;
}

describe("LegacyMirrorService", () => {
  const env = { ...process.env };
  let prisma: any;
  let connections: ConnectionsService;
  let mirror: LegacyMirrorService;

  beforeEach(() => {
    process.env.CREDENTIALS_KEY = crypto.randomBytes(32).toString("base64");
    prisma = fakePrisma();
    connections = new ConnectionsService(prisma);
    mirror = new LegacyMirrorService(prisma, connections);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("copies every legacy row, with secrets encrypted at rest", async () => {
    const summary = await mirror.backfill();
    expect(summary).toEqual({
      zoom: { copied: 1, upToDate: 0 },
      youtube: { copied: 1, upToDate: 0 },
      quota: 1,
    });

    const raw = JSON.stringify([...prisma.connections.values()]);
    for (const secret of ["zoom-secret", "yt-secret", "yt-refresh"]) {
      expect(raw).not.toContain(secret);
    }

    expect(await connections.find("user-1", "zoom")).toMatchObject({
      status: "active",
      externalAccountId: "zoom-acc",
      settings: { accountId: "zoom-acc", clientId: "zoom-client" },
      // An empty legacy secret is not copied
      secrets: { clientSecret: "zoom-secret" },
    });
    expect(await connections.find("user-1", "youtube")).toMatchObject({
      settings: { clientId: "yt-client" },
      secrets: { clientSecret: "yt-secret", refreshToken: "yt-refresh" },
      state: { channelVideosFetchedAt: "2026-09-20T01:00:00.000Z" },
      tokenObtainedAt: new Date("2026-09-19T00:00:00Z"),
    });
    expect(prisma.quota.get("user-1:youtube:2026-09-24")).toMatchObject({ unitsUsed: 3300 });
  });

  it("is idempotent: a second run copies nothing new", async () => {
    await mirror.backfill();
    const before = JSON.stringify([...prisma.connections.values()].map((c) => c.settings));
    expect(await mirror.backfill()).toEqual({
      zoom: { copied: 0, upToDate: 1 },
      youtube: { copied: 0, upToDate: 1 },
      quota: 1,
    });
    expect(JSON.stringify([...prisma.connections.values()].map((c) => c.settings))).toBe(before);
    expect(prisma.quota.size).toBe(1);
  });

  it("does not overwrite a Connection newer than its legacy row", async () => {
    await mirror.backfill();
    prisma.legacy.zoom[0] = zoomRow({ accountId: "stale", updatedAt: new Date("2026-09-01") });
    await mirror.backfill();
    expect((await connections.find("user-1", "zoom"))?.settings.accountId).toBe("zoom-acc");
  });

  it("copies a legacy change made after the last copy", async () => {
    await mirror.backfill();
    prisma.legacy.zoom[0] = zoomRow({ accountId: "acc-2", updatedAt: new Date("2030-01-01") });
    await mirror.backfill();
    expect((await connections.find("user-1", "zoom"))?.settings.accountId).toBe("acc-2");
  });

  it("dual-write mirrors the current legacy row, including cleared values", async () => {
    prisma.legacy.youtube[0] = youtubeRow({ isActive: false, refreshToken: "" });
    await mirror.mirrorYoutube("user-1");
    expect(await connections.find("user-1", "youtube")).toMatchObject({
      status: "disabled",
      secrets: { clientSecret: "yt-secret" },
    });
    await mirror.mirrorYoutubeQuota("user-1", "2026-09-24");
    expect(prisma.quota.get("user-1:youtube:2026-09-24").unitsUsed).toBe(3300);
  });

  it("never throws and skips the backfill without CREDENTIALS_KEY", async () => {
    delete process.env.CREDENTIALS_KEY;
    const withoutKey = new LegacyMirrorService(prisma, new ConnectionsService(prisma));
    await expect(withoutKey.mirrorZoom("user-1")).resolves.toBeUndefined();
    await expect(withoutKey.mirrorYoutube("user-1")).resolves.toBeUndefined();
    await expect(withoutKey.backfill()).resolves.toBeNull();
    expect(prisma.connections.size).toBe(0);
  });

  it("skips the backfill while another instance holds the lock", async () => {
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({ $queryRaw: jest.fn(async () => [{ locked: false }]) }),
    );
    await expect(mirror.backfill()).resolves.toBeNull();
    expect(prisma.connections.size).toBe(0);
  });
});
