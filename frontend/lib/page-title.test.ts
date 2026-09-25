import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTitleKey } from './page-title.ts';

test('pageTitleKey maps each menu route to its title', () => {
  assert.equal(pageTitleKey('/'), 'nav.home');
  assert.equal(pageTitleKey('/youtube/dashboard'), 'nav.dashboard');
  assert.equal(pageTitleKey('/youtube/channel-content'), 'nav.channelContent');
  assert.equal(pageTitleKey('/youtube/analytics'), 'nav.analytics');
  assert.equal(pageTitleKey('/zoom-utilities'), 'nav.zoom');
  assert.equal(pageTitleKey('/word-cloud/dashboard'), 'nav.wordCloud');
  assert.equal(pageTitleKey('/settings/integrations'), 'nav.integrations');
  assert.equal(pageTitleKey('/settings/personalization'), 'nav.personalization');
});

test('pageTitleKey matches nested routes by prefix', () => {
  assert.equal(pageTitleKey('/word-cloud/topics/abc/edit'), 'nav.wordCloud');
  assert.equal(pageTitleKey('/youtube/channel-content/extra'), 'nav.channelContent');
});

test('pageTitleKey falls back to home for unknown routes and partial segments', () => {
  assert.equal(pageTitleKey('/unknown'), 'nav.home');
  assert.equal(pageTitleKey('/youtube'), 'nav.home');
  assert.equal(pageTitleKey('/zoom-utilities-old'), 'nav.home');
});
