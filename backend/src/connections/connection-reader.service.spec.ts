import {
  ConnectionReader,
  viewToYoutubeConfig,
  viewToZoomConfig,
} from "./connection-reader.service";
import type { ConnectionView } from "./connections.service";
import { youtubeConfigToSnapshot, zoomConfigToSnapshot } from "./legacy-mapping";

const legacyZoom = {
  id: "z1",
  userId: "user-1",
  accountId: "acc",
  clientId: "cid",
  clientSecret: "sec",
  webhookSecretToken: "hook",
  isActive: true,
  updatedAt: new Date("2026-09-20T00:00:00Z"),
};
const legacyYoutube = {
  id: "y1",
  userId: "user-1",
  clientId: "ycid",
  clientSecret: "ysec",
  refreshToken: "tok",
  isActive: true,
  updatedAt: new Date("2026-09-20T00:00:00Z"),
  tokenObtainedAt: new Date("2026-09-19T00:00:00Z"),
  lastTokenRefreshAt: new Date("2026-09-20T00:00:00Z"),
  tokenInvalidAt: null,
  channelVideosFetchedAt: new Date("2026-09-20T01:00:00Z"),
};

// A Connection as the mirror writes it, read back decrypted
const viewOf = (userId: string, provider: "zoom" | "youtube", snapshot: any): ConnectionView => ({
  id: `${userId}:${provider}`,
  userId,
  provider,
  updatedAt: new Date("2026-09-25T00:00:00Z"), // time of the copy, not of the config
  ...snapshot,
});

describe("view → legacy shape", () => {
  it("round-trips a Zoom config through its Connection copy", () => {
    const { id, ...expected } = legacyZoom;
    expect(viewToZoomConfig(viewOf("user-1", "zoom", zoomConfigToSnapshot(legacyZoom as any)))).toEqual(expected);
  });

  it("round-trips a YouTube config through its Connection copy", () => {
    const { id, ...expected } = legacyYoutube;
    expect(
      viewToYoutubeConfig(viewOf("user-1", "youtube", youtubeConfigToSnapshot(legacyYoutube as any))),
    ).toEqual(expected);
  });
});

describe("ConnectionReader", () => {
  const env = { ...process.env };
  let prisma: any;
  let connections: any;
  let reader: ConnectionReader;

  beforeEach(() => {
    prisma = {
      zoomConfig: {
        findUnique: jest.fn().mockResolvedValue({ ...legacyZoom, clientId: "legacy" }),
        findMany: jest.fn().mockResolvedValue([
          { ...legacyZoom, userId: "user-1", clientId: "legacy" },
          { ...legacyZoom, userId: "user-2", clientId: "legacy-only" },
        ]),
      },
      youtubeConfig: { findUnique: jest.fn().mockResolvedValue({ ...legacyYoutube, clientId: "legacy" }) },
      youtubeQuotaUsage: {
        findUnique: jest.fn().mockResolvedValue({ unitsUsed: 100 }),
        findMany: jest.fn().mockResolvedValue([{ unitsUsed: 100 }]),
      },
      quotaUsage: {
        findUnique: jest.fn().mockResolvedValue({ unitsUsed: 200 }),
        findMany: jest.fn().mockResolvedValue([{ unitsUsed: 200 }, { unitsUsed: 300 }]),
      },
    };
    connections = {
      find: jest.fn(async (userId: string, provider: string) =>
        viewOf(userId, provider as any, provider === "zoom"
          ? zoomConfigToSnapshot(legacyZoom as any)
          : youtubeConfigToSnapshot(legacyYoutube as any)),
      ),
      findByExternalAccount: jest.fn(async () => [
        viewOf("user-1", "zoom", zoomConfigToSnapshot(legacyZoom as any)),
      ]),
    };
    reader = new ConnectionReader(prisma, connections);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("reads the legacy tables while CONNECTIONS_READ is off", async () => {
    delete process.env.CONNECTIONS_READ;
    expect((await reader.zoomConfig("user-1"))?.clientId).toBe("legacy");
    expect((await reader.youtubeConfig("user-1"))?.clientId).toBe("legacy");
    expect(await reader.youtubeQuotaUsed("user-1", "2026-09-25")).toBe(100);
    expect(await reader.youtubeQuotaHistory("user-1", 7)).toEqual([100]);
    expect(connections.find).not.toHaveBeenCalled();
  });

  it("reads Connection and QuotaUsage when CONNECTIONS_READ=true", async () => {
    process.env.CONNECTIONS_READ = "true";
    expect((await reader.zoomConfig("user-1"))?.clientId).toBe("cid");
    expect((await reader.youtubeConfig("user-1"))?.refreshToken).toBe("tok");
    expect(await reader.youtubeQuotaUsed("user-1", "2026-09-25")).toBe(200);
    expect(await reader.youtubeQuotaHistory("user-1", 7)).toEqual([200, 300]);
    expect(prisma.zoomConfig.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to legacy when the Connection is missing", async () => {
    process.env.CONNECTIONS_READ = "true";
    connections.find.mockResolvedValue(null);
    prisma.quotaUsage.findUnique.mockResolvedValue(null);
    prisma.quotaUsage.findMany.mockResolvedValue([]);
    expect((await reader.youtubeConfig("user-1"))?.clientId).toBe("legacy");
    expect(await reader.youtubeQuotaUsed("user-1", "2026-09-25")).toBe(100);
    expect(await reader.youtubeQuotaHistory("user-1", 7)).toEqual([100]);
  });

  it("falls back to legacy when reading the Connection fails (e.g. wrong key)", async () => {
    process.env.CONNECTIONS_READ = "true";
    connections.find.mockRejectedValue(new Error("Could not decrypt credentials"));
    expect((await reader.zoomConfig("user-1"))?.clientId).toBe("legacy");
  });

  it("lists a Zoom account's configs from Connection plus legacy-only accounts", async () => {
    process.env.CONNECTIONS_READ = "true";
    const configs = await reader.zoomConfigsByAccount("acc");
    expect(configs.map((c) => [c.userId, c.clientId])).toEqual([
      ["user-1", "cid"],
      ["user-2", "legacy-only"],
    ]);
    // The legacy updatedAt is kept, not the time of the copy
    expect(configs[0].updatedAt).toEqual(legacyZoom.updatedAt);
  });
});
