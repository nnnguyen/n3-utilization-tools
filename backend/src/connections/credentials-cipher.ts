import * as crypto from "crypto";

// Encrypts connection secrets (client secrets, refresh tokens, webhook tokens)
// before they are stored. AES-256-GCM with a random IV per write; the format
// "v1:<iv>:<tag>:<ciphertext>" (base64 parts) leaves room for a future scheme.
// Design: docs/design/P2-1-connector.md

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type Secrets = Record<string, string>;

export class CredentialsKeyError extends Error {}

/** A base64 key that must decode to exactly 32 bytes. */
export function parseKey(value: string, name: string): Buffer {
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new CredentialsKeyError(
      `${name} must be ${KEY_BYTES} random bytes in base64 (got ${key.length} bytes). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

export class CredentialsCipher {
  private readonly keys: Buffer[];

  /**
   * @param currentKey encrypts, and is tried first to decrypt
   * @param previousKey only decrypts (key rotation); data is re-encrypted with
   *   the current key on its next write
   */
  constructor(currentKey: Buffer, previousKey?: Buffer | null) {
    this.keys = previousKey ? [currentKey, previousKey] : [currentKey];
  }

  /** From CREDENTIALS_KEY (required) and CREDENTIALS_KEY_PREVIOUS (optional). */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): CredentialsCipher {
    if (!env.CREDENTIALS_KEY) {
      throw new CredentialsKeyError(
        "CREDENTIALS_KEY is not set: it is required to encrypt connection secrets",
      );
    }
    return new CredentialsCipher(
      parseKey(env.CREDENTIALS_KEY, "CREDENTIALS_KEY"),
      env.CREDENTIALS_KEY_PREVIOUS
        ? parseKey(env.CREDENTIALS_KEY_PREVIOUS, "CREDENTIALS_KEY_PREVIOUS")
        : null,
    );
  }

  /**
   * @param context bound to the ciphertext (GCM additional data), e.g. the
   *   connection "userId:provider", so a value copied to another row fails
   */
  encrypt(secrets: Secrets, context = ""): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.keys[0], iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(secrets), "utf8"),
      cipher.final(),
    ]);
    return [
      VERSION,
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      ciphertext.toString("base64"),
    ].join(":");
  }

  /** Throws if the payload is malformed, tampered with, or from an unknown key. */
  decrypt(payload: string, context = ""): Secrets {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error("Unsupported credentials format");
    }
    const [, iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
    for (const key of this.keys) {
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString("utf8");
        return JSON.parse(plaintext) as Secrets;
      } catch {
        // Wrong key (or tampered data): try the next key
      }
    }
    throw new Error(
      "Could not decrypt credentials: wrong CREDENTIALS_KEY or data tampered with",
    );
  }

  /** True when the payload was encrypted with an older key and should be rewritten. */
  needsReencryption(payload: string, context = ""): boolean {
    if (this.keys.length === 1) return false;
    try {
      new CredentialsCipher(this.keys[0]).decrypt(payload, context);
      return false;
    } catch {
      return true;
    }
  }
}
