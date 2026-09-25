import * as crypto from "crypto";
import { DEFAULT_WORKFLOW_SETTINGS } from "./workflow-template";

// Zoom webhooks carry the Zoom account id, not an app user: these helpers pick
// the app account that owns a webhook and verify its signature.

export interface WebhookOwnerCandidate {
  userId: string;
  isActive: boolean;
  updatedAt: Date;
  webhookSecretToken: string | null;
  // Automation Workflow setting; undefined (no saved settings) = the default (off)
  autoUpload?: boolean;
}

function mostRecent<T extends WebhookOwnerCandidate>(list: T[]): T | null {
  if (list.length === 0) return null;
  return list.reduce((latest, c) =>
    c.updatedAt.getTime() > latest.updatedAt.getTime() ? c : latest,
  );
}

/**
 * Among the app accounts configured with the webhook's Zoom account:
 * - `owner`: the active ones with auto-upload enabled; if several, the most
 *   recently updated config. New recordings are synced as this account.
 * - `account`: the most recently updated active one regardless of auto-upload,
 *   used for the webhook token; with no owner, the upload is skipped.
 */
export function resolveWebhookAccounts<T extends WebhookOwnerCandidate>(
  candidates: T[],
): { owner: T | null; account: T | null } {
  const active = candidates.filter((c) => c.isActive);
  return {
    owner: mostRecent(
      active.filter((c) => c.autoUpload ?? DEFAULT_WORKFLOW_SETTINGS.autoUpload),
    ),
    account: mostRecent(active),
  };
}

export function selectWebhookOwner<T extends WebhookOwnerCandidate>(
  candidates: T[],
): T | null {
  return resolveWebhookAccounts(candidates).owner;
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
