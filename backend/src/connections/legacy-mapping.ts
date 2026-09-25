import type { YoutubeConfig, ZoomConfig } from "@prisma/client";
import type { ConnectionSnapshot } from "./connections.service";

// ZoomConfig / YoutubeConfig rows as Connection snapshots. Until the legacy
// tables are removed (P2-1f) they stay the source of truth: the Connection is
// an exact copy, including cleared values. state.legacyUpdatedAt keeps the
// legacy row's updatedAt: rules that compare "most recently updated" (the
// Zoom webhook owner) must not see the time of the copy instead.

const onlyValues = (values: Record<string, string | null>) =>
  Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => !!entry[1]),
  );

export function zoomConfigToSnapshot(config: ZoomConfig): ConnectionSnapshot {
  return {
    status: config.isActive ? "active" : "disabled",
    externalAccountId: config.accountId || null,
    externalAccountName: null,
    settings: onlyValues({ accountId: config.accountId, clientId: config.clientId }),
    secrets: onlyValues({
      clientSecret: config.clientSecret,
      webhookSecretToken: config.webhookSecretToken,
    }),
    state: { legacyUpdatedAt: config.updatedAt.toISOString() },
    tokenObtainedAt: null,
    lastTokenRefreshAt: null,
    tokenInvalidAt: null,
  };
}

export function youtubeConfigToSnapshot(config: YoutubeConfig): ConnectionSnapshot {
  return {
    status: config.isActive ? "active" : "disabled",
    // The channel id is not stored in YoutubeConfig; P2-1d can fill it
    externalAccountId: null,
    externalAccountName: null,
    settings: onlyValues({ clientId: config.clientId }),
    secrets: onlyValues({
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    }),
    state: {
      legacyUpdatedAt: config.updatedAt.toISOString(),
      ...(config.channelVideosFetchedAt
        ? { channelVideosFetchedAt: config.channelVideosFetchedAt.toISOString() }
        : {}),
    },
    tokenObtainedAt: config.tokenObtainedAt,
    lastTokenRefreshAt: config.lastTokenRefreshAt,
    tokenInvalidAt: config.tokenInvalidAt,
  };
}
