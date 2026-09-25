// Shapes of /integrations/config sent to the browser: non-secret fields plus
// presence flags. Secrets (client secrets, webhook token, refresh token) never leave the backend.

export interface StoredZoomConfig {
  isActive: boolean;
  accountId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  webhookSecretToken: string | null;
}

export interface StoredYoutubeConfig {
  isActive: boolean;
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
}

export interface PublicZoomConfig {
  isActive: boolean;
  accountId: string | null;
  clientId: string | null;
  hasClientSecret: boolean;
  hasWebhookSecretToken: boolean;
}

export interface PublicYoutubeConfig {
  isActive: boolean;
  clientId: string | null;
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
}

export const ZOOM_SECRET_FIELDS = ["clientSecret", "webhookSecretToken"] as const;
export const YOUTUBE_SECRET_FIELDS = ["clientSecret", "refreshToken"] as const;

export function toPublicZoomConfig(
  config: StoredZoomConfig | null,
): PublicZoomConfig {
  return {
    isActive: config?.isActive ?? false,
    accountId: config?.accountId ?? null,
    clientId: config?.clientId ?? null,
    hasClientSecret: !!config?.clientSecret,
    hasWebhookSecretToken: !!config?.webhookSecretToken,
  };
}

export function toPublicYoutubeConfig(
  config: StoredYoutubeConfig | null,
): PublicYoutubeConfig {
  return {
    isActive: config?.isActive ?? false,
    clientId: config?.clientId ?? null,
    hasClientSecret: !!config?.clientSecret,
    hasRefreshToken: !!config?.refreshToken,
  };
}

export function toPublicConfig(
  zoom: StoredZoomConfig | null,
  youtube: StoredYoutubeConfig | null,
) {
  return {
    zoom: toPublicZoomConfig(zoom),
    youtube: toPublicYoutubeConfig(youtube),
  };
}

/**
 * An empty or missing secret means "keep the stored value": the browser no longer
 * receives secrets, so forms send them only when the user typed a new one.
 */
export function stripEmptySecrets<T extends object>(
  dto: T,
  secretFields: readonly string[],
): Partial<T> {
  const result = { ...dto } as Record<string, unknown>;
  for (const field of secretFields) {
    const value = result[field];
    if (value === undefined || value === null || value === "") {
      delete result[field];
    }
  }
  return result as Partial<T>;
}
