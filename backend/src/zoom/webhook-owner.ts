import * as crypto from "crypto";

// Zoom webhooks carry the Zoom account id, not an app user: these helpers pick
// the app account that owns a webhook and verify its signature.

export interface WebhookOwnerCandidate {
  userId: string;
  isActive: boolean;
  updatedAt: Date;
  webhookSecretToken: string | null;
  // Automation Workflow setting (P1-4); undefined until it exists = enabled
  autoUpload?: boolean;
}

/**
 * Among the app accounts configured with the webhook's Zoom account: the active
 * ones with auto-upload enabled; if several, the most recently updated config.
 */
export function selectWebhookOwner<T extends WebhookOwnerCandidate>(
  candidates: T[],
): T | null {
  const eligible = candidates.filter(
    (c) => c.isActive && c.autoUpload !== false,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, c) =>
    c.updatedAt.getTime() > latest.updatedAt.getTime() ? c : latest,
  );
}

export function zoomSignature(
  secret: string,
  timestamp: string,
  payload: unknown,
): string {
  const message = `v0:${timestamp}:${JSON.stringify(payload)}`;
  return `v0=${crypto.createHmac("sha256", secret).update(message).digest("hex")}`;
}

/**
 * "valid" when the signature matches one of the secrets, "invalid" when it
 * matches none, "unsigned" when no secret is configured at all (accepted, as
 * before per-account tokens existed).
 */
export function verifyZoomSignature(
  payload: unknown,
  timestamp: string | undefined,
  signature: string | undefined,
  secrets: (string | null | undefined)[],
): "valid" | "invalid" | "unsigned" {
  const configured = [...new Set(secrets.filter((s): s is string => !!s))];
  if (configured.length === 0) return "unsigned";
  if (!signature || !timestamp) return "invalid";

  const received = Buffer.from(signature);
  for (const secret of configured) {
    const expected = Buffer.from(zoomSignature(secret, timestamp, payload));
    if (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    ) {
      return "valid";
    }
  }
  return "invalid";
}
