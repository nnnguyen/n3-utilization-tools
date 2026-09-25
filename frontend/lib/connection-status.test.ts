import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAuthorize, cardState, type ConnectionCard } from './connection-status.ts';

const card = (over: Partial<ConnectionCard> = {}): ConnectionCard => ({
  provider: 'youtube',
  authType: 'oauth2',
  status: 'active',
  connected: true,
  externalAccountId: null,
  settings: { clientId: 'id' },
  secrets: { clientSecret: true, refreshToken: true },
  tokenHealth: { configured: true, tokenInvalid: false, expiringSoon: false },
  quota: null,
  ...over,
});

test('cardState: connected, disabled and never configured', () => {
  assert.equal(cardState(card()), 'connected');
  assert.equal(cardState(card({ status: 'disabled', connected: false })), 'disabled');
  assert.equal(cardState(card({ status: 'not_configured', connected: false })), 'not_connected');
});

test('cardState: a rejected token needs a new authorization', () => {
  assert.equal(
    cardState(card({ tokenHealth: { configured: true, tokenInvalid: true, expiringSoon: false } })),
    'needs_reauth',
  );
});

test('cardState: active but not yet authorized is not connected', () => {
  assert.equal(cardState(card({ connected: false, secrets: { clientSecret: true, refreshToken: false } })), 'not_connected');
});

test('canAuthorize needs the OAuth client id and secret', () => {
  assert.equal(canAuthorize(card()), true);
  assert.equal(canAuthorize(card({ secrets: { clientSecret: false, refreshToken: false } })), false);
  assert.equal(canAuthorize(card({ settings: { clientId: null } })), false);
  assert.equal(canAuthorize(card({ provider: 'zoom', authType: 'server_to_server' })), false);
});
