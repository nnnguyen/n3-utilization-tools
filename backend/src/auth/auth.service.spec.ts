import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { GoogleProfile } from "./strategies/google.strategy";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
  };

  const profile: GoogleProfile = {
    googleId: "google-123",
    email: "user@example.com",
    name: "Nguyen Van A",
    avatarUrl: "https://example.com/avatar.png",
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    };

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
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it("creates a new user on first login", async () => {
    const createdUser = { id: "user-1", ...profile };
    // Neither the Google id nor the email is known yet
    prisma.user.findUnique.mockResolvedValue(null);
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
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual(createdUser);
  });

  it("updates name/avatar/email for an existing user on subsequent login", async () => {
    const updatedProfile: GoogleProfile = { ...profile, name: "Nguyen Van B" };
    const updatedUser = { id: "user-1", ...updatedProfile };
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-1", ...profile });
    prisma.user.update.mockResolvedValue(updatedUser);

    const result = await service.validateOAuthUser(updatedProfile);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { googleId: profile.googleId },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        email: updatedProfile.email,
        name: "Nguyen Van B",
        avatarUrl: updatedProfile.avatarUrl,
        isEmailVerified: true,
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
    };
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // no user with this Google id
      .mockResolvedValueOnce(passwordUser); // but the email is registered
    prisma.user.update.mockResolvedValue({
      ...passwordUser,
      googleId: profile.googleId,
    });

    await service.validateOAuthUser(profile);

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: profile.email },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: {
        googleId: profile.googleId,
        // Keeps the name the user chose; fills the missing avatar from Google
        name: "Tên đã đặt",
        avatarUrl: profile.avatarUrl,
        isEmailVerified: true,
      },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("signs a JWT with the user id, email and name", () => {
    const token = service.signToken({ id: "user-1", ...profile } as never);
    expect(token).toBe("signed-jwt");
  });
});
