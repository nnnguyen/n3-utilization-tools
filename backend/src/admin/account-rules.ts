import * as crypto from "crypto";

// Account rules of the system administration (docs/design/P2-2-workspaces.md §6b)

export const SUPER_ADMIN = "super_admin";

// A temp password stops working after this many days unless the user sets their own
export const TEMP_PASSWORD_DAYS = 30;

// No look-alike characters (0/O, 1/l/I): the password is copied by hand
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(length = 12): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return password;
}

export function tempPasswordExpiry(now = new Date()): Date {
  return new Date(now.getTime() + TEMP_PASSWORD_DAYS * 24 * 60 * 60_000);
}

export type SignInBlock = "AUTH_ACCOUNT_LOCKED" | "AUTH_TEMP_PASSWORD_EXPIRED";

/** Why a password sign-in is refused (after the password matched), if it is. */
export function passwordSignInBlock(
  user: { isLocked: boolean; tempPasswordExpiresAt: Date | null },
  now = new Date(),
): SignInBlock | null {
  if (user.isLocked) return "AUTH_ACCOUNT_LOCKED";
  if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt <= now) {
    return "AUTH_TEMP_PASSWORD_EXPIRED";
  }
  return null;
}

// What an account that must change its password can still call
const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = [
  "GET /api/auth/session",
  "POST /api/auth/change-password",
  "PATCH /api/auth/preferences",
];

export function allowedWhilePasswordChangeRequired(method: string, url: string): boolean {
  const path = url.split("?")[0].replace(/\/+$/, "");
  return ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.includes(`${method.toUpperCase()} ${path}`);
}

/**
 * An action on `target` would leave the system without an active super admin:
 * demoting, locking or deleting the only one.
 */
export function removesLastSuperAdmin(
  target: { platformRole: string; isLocked: boolean },
  activeSuperAdmins: number,
): boolean {
  return target.platformRole === SUPER_ADMIN && !target.isLocked && activeSuperAdmins <= 1;
}
