import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";

const CODE_TTL_MS = 60_000;

interface PendingLogin {
  token: string;
  // The session user returned to the frontend (profile + preferences)
  user: Record<string, unknown>;
  expiresAt: number;
}

// One-time codes handed to the frontend after the Google OAuth redirect, so
// the access token itself never travels in a URL (history, logs, Referer).
// The frontend trades the code for the token via POST /auth/exchange.
// In memory: a code only lives for a minute, and the backend runs one instance.
@Injectable()
export class AuthCodeStore {
  private readonly pending = new Map<string, PendingLogin>();

  create(token: string, user: PendingLogin["user"]): string {
    this.sweep();
    const code = randomBytes(32).toString("base64url");
    this.pending.set(code, { token, user, expiresAt: Date.now() + CODE_TTL_MS });
    return code;
  }

  // Single use: the code is removed whether or not it is still valid
  consume(code: string): Omit<PendingLogin, "expiresAt"> | null {
    const entry = this.pending.get(code);
    this.pending.delete(code);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return { token: entry.token, user: entry.user };
  }

  private sweep() {
    const now = Date.now();
    for (const [code, entry] of this.pending) {
      if (entry.expiresAt < now) this.pending.delete(code);
    }
  }
}
