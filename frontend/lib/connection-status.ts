// Card of GET /connections (backend integrations/connection-card.ts)
export interface ConnectionCard {
  provider: 'youtube' | 'zoom';
  authType: 'oauth2' | 'server_to_server';
  status: 'not_configured' | 'active' | 'disabled';
  connected: boolean;
  externalAccountId: string | null;
  settings: Record<string, string | null>;
  secrets: Record<string, boolean>;
  tokenHealth: {
    configured: boolean;
    tokenInvalid: boolean;
    expiringSoon: boolean;
    daysRemaining?: number | null;
  };
  quota: { unitsUsed: number; unitsRemaining: number; quotaLimit: number; date: string } | null;
}

export type CardState = 'connected' | 'needs_reauth' | 'disabled' | 'not_connected';

/** What the Integrations card shows for a connection. */
export function cardState(card: ConnectionCard): CardState {
  if (card.status === 'disabled') return 'disabled';
  if (card.status === 'not_configured') return 'not_connected';
  // The provider rejected the stored token: authorize again
  if (card.tokenHealth.tokenInvalid) return 'needs_reauth';
  return card.connected ? 'connected' : 'not_connected';
}

/** OAuth apps can be authorized once their client id and secret are saved. */
export function canAuthorize(card: ConnectionCard): boolean {
  return card.authType === 'oauth2' && !!card.settings.clientId && !!card.secrets.clientSecret;
}
