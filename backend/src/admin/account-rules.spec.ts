import {
  allowedWhilePasswordChangeRequired,
  generateTempPassword,
  passwordSignInBlock,
  removesLastSuperAdmin,
  tempPasswordExpiry,
} from "./account-rules";

describe("generateTempPassword", () => {
  it("makes 12 unambiguous characters, different each time", () => {
    const a = generateTempPassword();
    expect(a).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{12}$/);
    expect(generateTempPassword()).not.toBe(a);
  });
});

describe("passwordSignInBlock", () => {
  const now = new Date("2026-09-26T00:00:00Z");
  it("refuses locked accounts and expired temp passwords", () => {
    expect(passwordSignInBlock({ isLocked: true, tempPasswordExpiresAt: null }, now)).toBe(
      "AUTH_ACCOUNT_LOCKED",
    );
    expect(
      passwordSignInBlock({ isLocked: false, tempPasswordExpiresAt: new Date("2026-09-25") }, now),
    ).toBe("AUTH_TEMP_PASSWORD_EXPIRED");
  });

  it("lets a valid temp password or a normal account through", () => {
    expect(
      passwordSignInBlock({ isLocked: false, tempPasswordExpiresAt: tempPasswordExpiry(now) }, now),
    ).toBeNull();
    expect(passwordSignInBlock({ isLocked: false, tempPasswordExpiresAt: null }, now)).toBeNull();
  });

  it("expires temp passwords after 30 days", () => {
    expect(tempPasswordExpiry(now).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("allowedWhilePasswordChangeRequired", () => {
  it("only lets the session, the password change and preferences through", () => {
    expect(allowedWhilePasswordChangeRequired("GET", "/api/auth/session")).toBe(true);
    expect(allowedWhilePasswordChangeRequired("post", "/api/auth/change-password")).toBe(true);
    expect(allowedWhilePasswordChangeRequired("PATCH", "/api/auth/preferences?x=1")).toBe(true);
    expect(allowedWhilePasswordChangeRequired("GET", "/api/zoom/recordings")).toBe(false);
    expect(allowedWhilePasswordChangeRequired("POST", "/api/auth/session")).toBe(false);
  });
});

describe("removesLastSuperAdmin", () => {
  it("protects the only active super admin", () => {
    expect(removesLastSuperAdmin({ platformRole: "super_admin", isLocked: false }, 1)).toBe(true);
    expect(removesLastSuperAdmin({ platformRole: "super_admin", isLocked: false }, 2)).toBe(false);
    expect(removesLastSuperAdmin({ platformRole: "user", isLocked: false }, 1)).toBe(false);
    // A locked super admin does not count as an active one
    expect(removesLastSuperAdmin({ platformRole: "super_admin", isLocked: true }, 1)).toBe(false);
  });
});
