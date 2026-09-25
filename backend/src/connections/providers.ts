// Apps the hub connects to. Adding one (Drive, Calendar, Zalo…) starts here.
// Values read from the environment are functions so they follow runtime env.
// Design: docs/design/P2-1-connector.md

export type ProviderId = "youtube" | "zoom";

export interface TokenPolicy {
  // Google expires refresh tokens after this many days while the OAuth consent
  // screen is in "Testing" mode (the API cannot tell the mode, so it is configured)
  testingMode: () => boolean;
  testingLifetimeDays: number;
  // Days after authorization to start warning about the expiry
  warnAfterDays: () => number;
}

export interface QuotaPolicy {
  dailyLimit: () => number;
  // The provider's quota day starts at midnight in this zone
  resetTimeZone: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  authType: "oauth2" | "server_to_server";
  // Non-secret configuration stored in Connection.settings
  settingsFields: readonly string[];
  // Stored encrypted in Connection.credentials, never returned by the API
  secretFields: readonly string[];
  // The secret whose presence means "connected" (OAuth refresh token…)
  connectedWhen: string;
  scopes: readonly string[];
  tokenPolicy: TokenPolicy | null;
  quota: QuotaPolicy | null;
}

const intFromEnv = (name: string, fallback: number) => {
  const value = parseInt(process.env[name] || "", 10);
  return Number.isNaN(value) ? fallback : value;
};

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  youtube: {
    id: "youtube",
    authType: "oauth2",
    settingsFields: ["clientId"],
    secretFields: ["clientSecret", "refreshToken"],
    connectedWhen: "refreshToken",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
    tokenPolicy: {
      testingMode: () => process.env.YOUTUBE_OAUTH_TESTING_MODE !== "false",
      testingLifetimeDays: 7,
      warnAfterDays: () => intFromEnv("YOUTUBE_TOKEN_WARN_AFTER_DAYS", 5),
    },
    quota: {
      dailyLimit: () => intFromEnv("YOUTUBE_QUOTA_LIMIT", 10000),
      // Google resets the YouTube quota at midnight Pacific Time
      resetTimeZone: "America/Los_Angeles",
    },
  },
  zoom: {
    id: "zoom",
    authType: "server_to_server",
    settingsFields: ["accountId", "clientId"],
    secretFields: ["clientSecret", "webhookSecretToken"],
    connectedWhen: "clientSecret",
    scopes: [],
    tokenPolicy: null,
    quota: null,
  },
};

export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

export function getProvider(id: string): ProviderDefinition {
  if (!isProviderId(id)) throw new Error(`Unknown provider: ${id}`);
  return PROVIDERS[id];
}
