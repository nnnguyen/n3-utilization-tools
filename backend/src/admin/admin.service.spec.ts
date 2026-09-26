import * as bcrypt from "bcrypt";
import { AdminService } from "./admin.service";

describe("AdminService", () => {
  let prisma: any;
  let activity: { record: jest.Mock };
  let service: AdminService;
  const superAdmin = {
    id: "admin-1",
    email: "admin@example.com",
    platformRole: "super_admin",
    isLocked: false,
    password: "hash",
  };
  const member = { id: "user-2", email: "b@example.com", platformRole: "user", isLocked: false };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(async ({ where }) => (where.id === "admin-1" ? superAdmin : member)),
        create: jest.fn(async ({ data }) => ({ id: "new-1", createdAt: new Date(), ...data })),
        update: jest.fn(async ({ where, data }) => ({
          ...(where.id === "admin-1" ? superAdmin : member),
          ...data,
        })),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    activity = { record: jest.fn() };
    service = new AdminService(prisma, activity as any);
  });

  it("creates an account with a temp password returned once and stored hashed", async () => {
    const { account, tempPassword } = await service.createAccount("admin-1", {
      email: " new@example.com ",
      name: "New",
    });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      email: "new@example.com",
      isEmailVerified: true,
      mustChangePassword: true,
    });
    expect(data.password).not.toBe(tempPassword);
    expect(await bcrypt.compare(tempPassword, data.password)).toBe(true);
    expect(data.tempPasswordExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(account).not.toHaveProperty("password");
    expect(JSON.stringify(activity.record.mock.calls)).not.toContain(tempPassword);
  });

  it("refuses an email that already exists (any case)", async () => {
    prisma.user.findFirst.mockResolvedValue(member);
    await expect(
      service.createAccount("admin-1", { email: "B@example.com" }),
    ).rejects.toMatchObject({ response: { code: "AUTH_EMAIL_EXISTS" } });
  });

  it("protects the last super admin and the admin's own account", async () => {
    await expect(
      service.updateAccount("admin-1", "admin-1", { isLocked: true }),
    ).rejects.toMatchObject({ response: { code: "ADMIN_CANNOT_TARGET_SELF" } });
    await expect(service.deleteAccount("admin-1", "admin-1")).rejects.toMatchObject({
      response: { code: "ADMIN_CANNOT_TARGET_SELF" },
    });
    // Another admin demoting the only super admin
    await expect(
      service.updateAccount("admin-2", "admin-1", { platformRole: "user" }),
    ).rejects.toMatchObject({ response: { code: "ADMIN_LAST_SUPER_ADMIN" } });
    prisma.user.count.mockResolvedValue(2);
    await expect(
      service.updateAccount("admin-2", "admin-1", { platformRole: "user" }),
    ).resolves.toMatchObject({ platformRole: "user" });
  });

  it("records each change of an account", async () => {
    await service.updateAccount("admin-1", "user-2", {
      isEmailVerified: true,
      isLocked: true,
      platformRole: "super_admin",
    });
    const actions = activity.record.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual([
      "admin.user.verified",
      "admin.user.locked",
      "admin.super_admin.granted",
    ]);
  });

  it("resets the temp password (the old one stops working)", async () => {
    const { tempPassword } = await service.resetTempPassword("admin-1", "user-2", {
      mustChangePassword: false,
    });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(await bcrypt.compare(tempPassword, data.password)).toBe(true);
    expect(data).toMatchObject({ mustChangePassword: false });
    expect(data.tempPasswordExpiresAt).toBeInstanceOf(Date);
  });
});
