import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { ActivityService } from "../activity/activity.service";
import { GoogleProfile } from "./strategies/google.strategy";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
  };
  let activity: { record: jest.Mock };
  const env = { ...process.env };

  const profile: GoogleProfile = {
    googleId: "google-123",
    email: "user@example.com",
    name: "Nguyen Van A",
    avatarUrl: "https://example.com/avatar.png",
  };

  // findUnique answers by the key it is asked for
  const usersBy = (byGoogleId: object | null, byEmail: object | null = null) =>
    prisma.user.findUnique.mockImplementation(async ({ where }) =>
      where.googleId ? byGoogleId : where.email ? byEmail : null,
    );

  beforeEach(async () => {
    delete process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(async ({ data }) => ({ id: "user-1", ...profile, ...data })),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    activity = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue("signed-jwt") },
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendResetPasswordEmail: jest.fn(),
          },
        },
        { provide: ActivityService, useValue: activity },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  describe("validateOAuthUser", () => {
    it("creates a new user on first login", async () => {
      const createdUser = { id: "user-1", ...profile };
      usersBy(null, null);
      prisma.user.create.mockResolvedValue(createdUser);

      const result = await service.validateOAuthUser(profile);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          googleId: profile.googleId,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          isEmailVerified: true,
        },
      });
      expect(result).toEqual(createdUser);
    });

    it("updates name/avatar/email for an existing user on subsequent login", async () => {
      const updatedProfile: GoogleProfile = { ...profile, name: "Nguyen Van B" };
      usersBy({ id: "user-1", ...profile, isLocked: false });

      const result = await service.validateOAuthUser(updatedProfile);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          email: updatedProfile.email,
          name: "Nguyen Van B",
          avatarUrl: updatedProfile.avatarUrl,
          isEmailVerified: true,
          // Google proves the identity: a pending temp-password change is dropped
          mustChangePassword: false,
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.name).toBe("Nguyen Van B");
    });

    it("links Google to an existing email/password account instead of creating a duplicate", async () => {
      const passwordUser = {
        id: "user-2",
        email: profile.email,
        googleId: null,
        name: "Tên đã đặt",
        avatarUrl: null,
        isLocked: false,
      };
      usersBy(null, passwordUser);

      await service.validateOAuthUser(profile);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: {
          googleId: profile.googleId,
          // Keeps the name the user chose; fills the missing avatar from Google
          name: "Tên đã đặt",
          avatarUrl: profile.avatarUrl,
          isEmailVerified: true,
          mustChangePassword: false,
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("refuses a locked account", async () => {
      usersBy({ id: "user-1", ...profile, isLocked: true });
      await expect(service.validateOAuthUser(profile)).rejects.toMatchObject({
        response: { code: "AUTH_ACCOUNT_LOCKED" },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  it("signs a JWT with the user id, email and name", () => {
    const token = service.signToken({ id: "user-1", ...profile } as never);
    expect(token).toBe("signed-jwt");
  });

  describe("login", () => {
    const passwordUser = async (over: object = {}) => ({
      id: "user-1",
      email: "user@example.com",
      password: await bcrypt.hash("secret1", 4),
      isEmailVerified: true,
      isLocked: false,
      tempPasswordExpiresAt: null,
      platformRole: "user",
      ...over,
    });

    it("refuses a locked account and an expired temp password", async () => {
      prisma.user.findUnique.mockResolvedValue(await passwordUser({ isLocked: true }));
      await expect(
        service.login({ email: "user@example.com", password: "secret1" }),
      ).rejects.toMatchObject({ response: { code: "AUTH_ACCOUNT_LOCKED" } });

      prisma.user.findUnique.mockResolvedValue(
        await passwordUser({ tempPasswordExpiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.login({ email: "user@example.com", password: "secret1" }),
      ).rejects.toMatchObject({ response: { code: "AUTH_TEMP_PASSWORD_EXPIRED" } });
    });

    it("signs in with a valid temp password", async () => {
      prisma.user.findUnique.mockResolvedValue(
        await passwordUser({ tempPasswordExpiresAt: new Date(Date.now() + 60_000) }),
      );
      await expect(
        service.login({ email: "user@example.com", password: "secret1" }),
      ).resolves.toMatchObject({ id: "user-1" });
    });
  });

  describe("bootstrapSuperAdmin", () => {
    const user = { id: "user-1", email: "Gerald@Example.com", platformRole: "user" } as never;

    it("promotes the bootstrap email while there is no super admin", async () => {
      process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = "gerald@example.com";
      const promoted = await service.bootstrapSuperAdmin(user);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { platformRole: "super_admin" },
      });
      expect(promoted).toMatchObject({ platformRole: "super_admin" });
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "admin.super_admin.bootstrapped", actorId: null }),
      );
    });

    it("does nothing once a super admin exists", async () => {
      process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = "gerald@example.com";
      prisma.user.count.mockResolvedValue(1);
      await service.bootstrapSuperAdmin(user);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("ignores other accounts and a missing variable", async () => {
      process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = "someone-else@example.com";
      await service.bootstrapSuperAdmin(user);
      delete process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
      await service.bootstrapSuperAdmin(user);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("promotes an existing account at startup (no sign-in needed)", async () => {
      process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = "gerald@example.com";
      prisma.user.findFirst.mockResolvedValue({ id: "user-9", email: "gerald@example.com" });
      await service.bootstrapSuperAdmin();
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: "gerald@example.com", mode: "insensitive" } },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-9" },
        data: { platformRole: "super_admin" },
      });
    });
  });

  describe("changePassword", () => {
    it("needs the current password, then ends the temp password", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        password: await bcrypt.hash("temp-pass", 4),
        mustChangePassword: true,
      });
      await expect(
        service.changePassword("user-1", { currentPassword: "wrong", newPassword: "new-pass" }),
      ).rejects.toMatchObject({ response: { code: "AUTH_WRONG_CURRENT_PASSWORD" } });
      await expect(
        service.changePassword("user-1", { currentPassword: "temp-pass", newPassword: "temp-pass" }),
      ).rejects.toMatchObject({ response: { code: "AUTH_SAME_PASSWORD" } });

      await service.changePassword("user-1", {
        currentPassword: "temp-pass",
        newPassword: "new-pass",
      });
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ mustChangePassword: false, tempPasswordExpiresAt: null });
      expect(await bcrypt.compare("new-pass", data.password)).toBe(true);
    });

    it("lets a Google-only account set its first password", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", password: null });
      await service.changePassword("user-1", { newPassword: "first-pass" });
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});
