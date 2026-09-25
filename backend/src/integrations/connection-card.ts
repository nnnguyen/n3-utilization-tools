import type { ProviderDefinition } from "../connections/providers";
import type { TokenHealth } from "../connections/token-health";

// What GET /connections returns per app: never a secret, only whether each
// one is stored (same rule as public-config.ts)

export interface QuotaStatus {
  unitsUsed: number;
  unitsRemaining: number;
  quotaLimit: number;
  date: string;
}

export interface ConnectionCard {
  provider: string;
  authType: ProviderDefinition["authType"];
  // not_configured: nothing saved yet
  status: "not_configured" | "active" | "disabled";
  // Usable right now: active, and its "connected" secret is stored
  connected: boolean;
  externalAccountId: string | null;
  settings: Record<string, string | null>;
  secrets: Record<string, boolean>;
  tokenHealth: TokenHealth;
  quota: QuotaStatus | null;
}

export function connectionCard(
  provider: ProviderDefinition,
  config: ({ isActive: boolean } & Record<string, unknown>) | null,
  tokenHealth: TokenHealth,
  quota: QuotaStatus | null,
): ConnectionCard {
  const value = (field: string) => {
    const v = config?.[field];
    return typeof v === "string" && v ? v : null;
  };
  return {
    provider: provider.id,
    authType: provider.authType,
    status: !config ? "not_configured" : config.isActive ? "active" : "disabled",
    connected: !!config?.isActive && !!value(provider.connectedWhen),
    externalAccountId: provider.id === "zoom" ? value("accountId") : null,
    settings: Object.fromEntries(provider.settingsFields.map((f) => [f, value(f)])),
    secrets: Object.fromEntries(provider.secretFields.map((f) => [f, !!value(f)])),
    tokenHealth,
    quota,
  };
}
