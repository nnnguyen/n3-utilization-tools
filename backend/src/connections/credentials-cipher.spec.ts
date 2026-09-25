import * as crypto from "crypto";
import {
  CredentialsCipher,
  CredentialsKeyError,
  parseKey,
} from "./credentials-cipher";

const newKey = () => crypto.randomBytes(32);
const secrets = { clientSecret: "s3cr3t", refreshToken: "1//tok-éà" };

describe("CredentialsCipher", () => {
  it("round-trips secrets without exposing them in the payload", () => {
    const cipher = new CredentialsCipher(newKey());
    const payload = cipher.encrypt(secrets, "user-1:youtube");
    expect(payload).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(payload).not.toContain("s3cr3t");
    expect(cipher.decrypt(payload, "user-1:youtube")).toEqual(secrets);
  });

  it("uses a new IV for every write", () => {
    const cipher = new CredentialsCipher(newKey());
    expect(cipher.encrypt(secrets)).not.toBe(cipher.encrypt(secrets));
  });

  it("rejects a tampered payload", () => {
    const cipher = new CredentialsCipher(newKey());
    const [v, iv, tag, data] = cipher.encrypt(secrets).split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() =>
      cipher.decrypt([v, iv, tag, flipped.toString("base64")].join(":")),
    ).toThrow(/Could not decrypt/);
  });

  it("rejects a payload moved to another context", () => {
    const cipher = new CredentialsCipher(newKey());
    const payload = cipher.encrypt(secrets, "user-1:youtube");
    expect(() => cipher.decrypt(payload, "user-2:youtube")).toThrow(/Could not decrypt/);
  });

  it("rejects a payload encrypted with an unknown key", () => {
    const payload = new CredentialsCipher(newKey()).encrypt(secrets);
    expect(() => new CredentialsCipher(newKey()).decrypt(payload)).toThrow(
      /wrong CREDENTIALS_KEY/,
    );
  });

  it("rejects unknown formats", () => {
    const cipher = new CredentialsCipher(newKey());
    expect(() => cipher.decrypt("plain-text-secret")).toThrow(/Unsupported/);
    expect(() => cipher.decrypt("v2:a:b:c")).toThrow(/Unsupported/);
  });

  it("decrypts with the previous key during rotation and flags re-encryption", () => {
    const oldKey = newKey();
    const payload = new CredentialsCipher(oldKey).encrypt(secrets);
    const rotated = new CredentialsCipher(newKey(), oldKey);
    expect(rotated.decrypt(payload)).toEqual(secrets);
    expect(rotated.needsReencryption(payload)).toBe(true);
    expect(rotated.needsReencryption(rotated.encrypt(secrets))).toBe(false);
  });
});

describe("CredentialsCipher.fromEnv", () => {
  const b64 = () => newKey().toString("base64");

  it("reads the current and previous keys", () => {
    const previous = b64();
    const old = CredentialsCipher.fromEnv({ CREDENTIALS_KEY: previous });
    const payload = old.encrypt(secrets);
    const rotated = CredentialsCipher.fromEnv({
      CREDENTIALS_KEY: b64(),
      CREDENTIALS_KEY_PREVIOUS: previous,
    });
    expect(rotated.decrypt(payload)).toEqual(secrets);
  });

  it("fails clearly when the key is missing", () => {
    expect(() => CredentialsCipher.fromEnv({})).toThrow(CredentialsKeyError);
    expect(() => CredentialsCipher.fromEnv({})).toThrow(/CREDENTIALS_KEY is not set/);
  });

  it("fails clearly when a key has the wrong length", () => {
    expect(() => parseKey("dG9vLXNob3J0", "CREDENTIALS_KEY")).toThrow(
      /CREDENTIALS_KEY must be 32 random bytes in base64 \(got 9 bytes\)/,
    );
    expect(() =>
      CredentialsCipher.fromEnv({ CREDENTIALS_KEY: b64(), CREDENTIALS_KEY_PREVIOUS: "abc" }),
    ).toThrow(/CREDENTIALS_KEY_PREVIOUS/);
  });
});
