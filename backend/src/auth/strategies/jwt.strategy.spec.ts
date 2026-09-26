import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy.validate", () => {
  const payload = { sub: "user-1", email: "a@example.com", name: "A" };
  const account = (over: object = {}) => ({
    id: "user-1",
    email: "a@example.com",
    name: "A",
    platformRole: "user",
    isLocked: false,
    mustChangePassword: false,
    ...over,
  });
  const req = (method: string, url: string) => ({ method, originalUrl: url }) as any;
  let prisma: any;
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma);
  });

  it("returns the account's current role", async () => {
    prisma.user.findUnique.mockResolvedValue(account({ platformRole: "super_admin" }));
    await expect(strategy.validate(req("GET", "/api/zoom/recordings"), payload)).resolves.toEqual({
      id: "user-1",
      email: "a@example.com",
      name: "A",
      platformRole: "super_admin",
    });
  });

  it("rejects a deleted or locked account even with a valid token", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(req("GET", "/api/x"), payload)).rejects.toThrow();
    prisma.user.findUnique.mockResolvedValue(account({ isLocked: true }));
    await expect(strategy.validate(req("GET", "/api/x"), payload)).rejects.toMatchObject({
      response: { code: "AUTH_ACCOUNT_LOCKED" },
    });
  });

  it("only allows the password change while one is required", async () => {
    prisma.user.findUnique.mockResolvedValue(account({ mustChangePassword: true }));
    await expect(
      strategy.validate(req("GET", "/api/youtube/status"), payload),
    ).rejects.toMatchObject({ response: { code: "AUTH_PASSWORD_CHANGE_REQUIRED" } });
    await expect(
      strategy.validate(req("POST", "/api/auth/change-password"), payload),
    ).resolves.toMatchObject({ id: "user-1" });
    await expect(strategy.validate(req("GET", "/api/auth/session"), payload)).resolves.toBeTruthy();
  });
});
