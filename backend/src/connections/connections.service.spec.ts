import * as crypto from "crypto";
import { BadRequestException } from "@nestjs/common";
import { ConnectionsService } from "./connections.service";

// Minimal in-memory stand-in for prisma.connection
function fakePrisma() {
  const rows = new Map<string, any>();
  const key = (userId: string, provider: string) => `${userId}:${provider}`;
  const matches = (row: any, where: any): boolean =>
    Object.entries(where).every(([field, cond]: [string, any]) => {
      if (field === "OR") return cond.some((c: any) => matches(row, c));
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("lt" in cond) return row[field] !== null && row[field] < cond.lt;
        if ("not" in cond) return row[field] !== cond.not;
      }
      return row[field] === cond;
    });
  return {
    rows,
    connection: {
      findUnique: jest.fn(async ({ where }) =>
        rows.get(key(where.userId_provider.userId, where.userId_provider.provider)) ?? null,
      ),
      upsert: jest.fn(async ({ where, update, create }) => {
        const k = key(where.userId_provider.userId, where.userId_provider.provider);
        const current = rows.get(k);
        const defined = (o: any) =>
          Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
        const row = current
          ? { ...current, ...defined(update), updatedAt: new Date() }
          : {
              id: `id-${rows.size + 1}`,
              status: "active",
              externalAccountId: null,
              externalAccountName: null,
              settings: {},
              credentials: null,
              state: {},
              tokenObtainedAt: null,
              lastTokenRefreshAt: null,
              tokenInvalidAt: null,
              ...defined(create),
              updatedAt: new Date(),
            };
        rows.set(k, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      }),
    },
  };
}

describe("ConnectionsService", () => {
  const env = { ...process.env };
  let prisma: ReturnType<typeof fakePrisma>;
  let service: ConnectionsService;

  beforeEach(() => {
    process.env.CREDENTIALS_KEY = crypto.randomBytes(32).toString("base64");
    prisma = fakePrisma();
    service = new ConnectionsService(prisma as any);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("stores secrets encrypted and reads them back decrypted", async () => {
    await service.save("user-1", "youtube", {
      settings: { clientId: "client-id" },
      secrets: { clientSecret: "s3cret", refreshToken: "tok" },
    });
    const stored = prisma.rows.get("user-1:youtube");
    expect(stored.credentials).toMatch(/^v1:/);
    expect(JSON.stringify(stored)).not.toContain("s3cret");

    const view = await service.find("user-1", "youtube");
    expect(view).toMatchObject({
      provider: "youtube",
      status: "active",
      settings: { clientId: "client-id" },
      secrets: { clientSecret: "s3cret", refreshToken: "tok" },
    });
  });

  it("keeps a stored secret when the new value is empty or missing", async () => {
    await service.save("user-1", "zoom", {
      settings: { accountId: "acc", clientId: "id" },
      secrets: { clientSecret: "old", webhookSecretToken: "hook" },
    });
    await service.save("user-1", "zoom", {
      settings: { accountId: "acc-2" },
      secrets: { clientSecret: "", webhookSecretToken: undefined },
    });
    expect(await service.find("user-1", "zoom")).toMatchObject({
      settings: { accountId: "acc-2", clientId: "id" },
      secrets: { clientSecret: "old", webhookSecretToken: "hook" },
    });
  });

  it("rejects fields the provider does not declare", async () => {
    await expect(
      service.save("user-1", "zoom", { secrets: { refreshToken: "x" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save("user-1", "youtube", { settings: { accountId: "x" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cannot decrypt another account's credentials copied over", async () => {
    await service.save("user-1", "youtube", { secrets: { refreshToken: "tok" } });
    await service.save("user-2", "youtube", { secrets: { refreshToken: "other" } });
    prisma.rows.get("user-2:youtube").credentials =
      prisma.rows.get("user-1:youtube").credentials;
    await expect(service.find("user-2", "youtube")).rejects.toThrow(/Could not decrypt/);
  });

  it("fails clearly without CREDENTIALS_KEY, only when secrets are used", async () => {
    delete process.env.CREDENTIALS_KEY;
    const withoutKey = new ConnectionsService(prisma as any);
    await expect(withoutKey.find("nobody", "youtube")).resolves.toBeNull();
    await expect(
      withoutKey.save("user-1", "youtube", { secrets: { refreshToken: "tok" } }),
    ).rejects.toThrow(/CREDENTIALS_KEY is not set/);
  });

  it("tracks the token lifecycle and derives its health", async () => {
    const now = new Date("2026-09-25T12:00:00Z");
    await service.save("user-1", "youtube", { secrets: { refreshToken: "tok" } });
    await service.markTokenIssued("user-1", "youtube", now);
    expect(await service.tokenHealth("user-1", "youtube", now)).toMatchObject({
      configured: true,
      daysRemaining: 7,
      tokenInvalid: false,
    });

    await service.markTokenInvalid("user-1", "youtube", now);
    expect(await service.tokenHealth("user-1", "youtube", now)).toMatchObject({
      tokenInvalid: true,
    });

    // A successful refresh clears the invalid flag
    await service.markTokenRefreshed("user-1", "youtube", new Date(now.getTime() + 60_000));
    expect(await service.tokenHealth("user-1", "youtube", now)).toMatchObject({
      tokenInvalid: false,
    });
  });

  it("throttles refresh bookkeeping to one write per 5 minutes", async () => {
    const now = new Date("2026-09-25T12:00:00Z");
    await service.save("user-1", "youtube", { secrets: { refreshToken: "tok" } });
    await service.markTokenIssued("user-1", "youtube", now);
    await service.markTokenRefreshed("user-1", "youtube", new Date(now.getTime() + 60_000));
    expect(prisma.rows.get("user-1:youtube").lastTokenRefreshAt).toEqual(now);
    const later = new Date(now.getTime() + 6 * 60_000);
    await service.markTokenRefreshed("user-1", "youtube", later);
    expect(prisma.rows.get("user-1:youtube").lastTokenRefreshAt).toEqual(later);
  });

  it("disconnect clears the secrets and disables the connection", async () => {
    await service.save("user-1", "zoom", { secrets: { clientSecret: "s" } });
    await service.disconnect("user-1", "zoom");
    expect(await service.find("user-1", "zoom")).toMatchObject({
      status: "disabled",
      secrets: {},
    });
    expect(await service.tokenHealth("user-1", "zoom")).toMatchObject({ configured: false });
  });
});
