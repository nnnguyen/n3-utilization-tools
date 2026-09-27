const getToken = jest.fn();
const aboutGet = jest.fn();
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation((clientId, clientSecret, redirectUri) => ({
        clientId,
        redirectUri,
        getToken,
        setCredentials: jest.fn(),
        on: jest.fn(),
        generateAuthUrl: (options: any) => `https://accounts.google.com/o?${new URLSearchParams(options)}`,
      })),
    },
    drive: () => ({ about: { get: aboutGet } }),
  },
}));

import { createOAuthState } from "../connections/oauth-state";
import { driveCallbackUrl, GoogleDriveService } from "./google-drive.service";

describe("GoogleDriveService", () => {
  const env = { ...process.env };
  let connections: any;
  let reader: any;
  let service: GoogleDriveService;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    getToken.mockReset();
    aboutGet.mockReset();
    connections = {
      save: jest.fn(),
      markTokenIssued: jest.fn(),
      markTokenInvalid: jest.fn(),
      find: jest.fn().mockResolvedValue({ status: "active", secrets: { refreshToken: "rt" } }),
      disconnect: jest.fn(),
    };
    reader = { youtubeConfig: jest.fn().mockResolvedValue({ clientId: "cid", clientSecret: "secret" }) };
    service = new GoogleDriveService(connections, reader);
  });
  afterAll(() => (process.env = env));

  it("sends Google back to this backend", () => {
    expect(driveCallbackUrl({ RAILWAY_PUBLIC_DOMAIN: "backend.up.railway.app" })).toBe(
      "https://backend.up.railway.app/api/connections/google_drive/callback",
    );
    expect(driveCallbackUrl({ GOOGLE_DRIVE_CALLBACK_URL: "https://x/cb" })).toBe("https://x/cb");
    expect(driveCallbackUrl({})).toBe("http://localhost:3001/api/connections/google_drive/callback");
  });

  it("asks for drive.file only, offline, with a signed state", async () => {
    const url = new URL(await service.authUrl("user-1"));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).not.toBe("user-1");
  });

  it("needs the Google client of the YouTube card", async () => {
    reader.youtubeConfig.mockResolvedValue(null);
    delete process.env.YOUTUBE_CLIENT_ID;
    await expect(service.authUrl("user-1")).rejects.toThrow(/Client ID/);
  });

  it("stores the refresh token and the Drive account of the state's user", async () => {
    getToken.mockResolvedValue({ tokens: { refresh_token: "new-rt", access_token: "at" } });
    aboutGet.mockResolvedValue({ data: { user: { emailAddress: "ban@example.com", displayName: "Ban Học Tập" } } });
    const state = createOAuthState({ userId: "user-1", provider: "google_drive" });
    await expect(service.handleCallback("code", state)).resolves.toBe("user-1");
    expect(connections.save).toHaveBeenCalledWith("user-1", "google_drive", {
      status: "active",
      externalAccountId: "ban@example.com",
      externalAccountName: "Ban Học Tập",
      secrets: { refreshToken: "new-rt" },
    });
    expect(connections.markTokenIssued).toHaveBeenCalledWith("user-1", "google_drive");
  });

  it("refuses a forged or foreign state without calling Google", async () => {
    await expect(service.handleCallback("code", "user-1")).rejects.toThrow(/Invalid or expired/);
    const youtube = createOAuthState({ userId: "user-1", provider: "youtube" });
    await expect(service.handleCallback("code", youtube)).rejects.toThrow(/Invalid or expired/);
    expect(getToken).not.toHaveBeenCalled();
    expect(connections.save).not.toHaveBeenCalled();
  });

  it("reads the Drive space, and never throws when Google refuses", async () => {
    aboutGet.mockResolvedValue({ data: { storageQuota: { limit: "16106127360", usage: "1073741824" } } });
    await expect(service.storage("user-1")).resolves.toEqual({ limit: 16106127360, usage: 1073741824 });
    aboutGet.mockRejectedValue(Object.assign(new Error("invalid_grant"), { response: { data: { error: "invalid_grant" } } }));
    await expect(service.storage("user-1")).resolves.toBeNull();
    expect(connections.markTokenInvalid).toHaveBeenCalledWith("user-1", "google_drive");
    connections.find.mockResolvedValue(null);
    await expect(service.storage("user-1")).resolves.toBeNull();
  });
});
