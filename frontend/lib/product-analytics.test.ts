import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAnalyticsLoad,
  cleanCapture,
  isUntrackedPath,
  setAnalyticsClient,
  shouldTrack,
  trackEvent,
} from './product-analytics.ts';

test('shouldTrack: needs a key and an explicit yes', () => {
  assert.equal(shouldTrack({ key: 'phc_x', consent: true, pathname: '/' }), true);
  assert.equal(shouldTrack({ key: undefined, consent: true, pathname: '/' }), false);
  assert.equal(shouldTrack({ key: '', consent: true, pathname: '/' }), false);
  assert.equal(shouldTrack({ key: 'phc_x', consent: null, pathname: '/' }), false);
  assert.equal(shouldTrack({ key: 'phc_x', consent: false, pathname: '/' }), false);
  assert.equal(shouldTrack({ key: 'phc_x', consent: undefined, pathname: '/' }), false);
});

test('the Word Cloud audience pages are never tracked', () => {
  assert.equal(isUntrackedPath('/word-cloud/join/ABC123'), true);
  assert.equal(isUntrackedPath('/word-cloud/join'), true);
  assert.equal(isUntrackedPath('/word-cloud/joined'), false);
  assert.equal(isUntrackedPath('/word-cloud/dashboard'), false);
  assert.equal(shouldTrack({ key: 'phc_x', consent: true, pathname: '/word-cloud/join/ABC' }), false);
});

test('cleanCapture strips query strings from every URL property', () => {
  const event = {
    event: '$pageview',
    properties: {
      $current_url: 'https://app.example/login?authCode=secret#x',
      $pathname: '/login',
      $referrer: 'https://accounts.google.com/o?code=4/0Ab',
      $prev_pageview_url: '/settings/integrations?code=abc',
      $referring_domain: '$direct',
      other: 'kept?as=is',
      $session_entry_url: 'http://localhost:3000/zoom?authCode=x',
      $initial_person_info: { r: '$direct', u: 'https://app.example/a?authCode=y' },
      list: ['/b?code=z'],
    },
    $set_once: { $initial_current_url: 'https://app.example/?authCode=1', $initial_referrer: '$direct' },
  };
  const cleaned = cleanCapture(event)!;
  assert.equal(cleaned.properties.$current_url, 'https://app.example/login');
  assert.equal(cleaned.properties.$referrer, 'https://accounts.google.com/o');
  assert.equal(cleaned.properties.$prev_pageview_url, '/settings/integrations');
  assert.equal(cleaned.properties.$referring_domain, '$direct');
  assert.equal(cleaned.properties.other, 'kept?as=is');
  assert.equal(cleaned.properties.$session_entry_url, 'http://localhost:3000/zoom');
  assert.deepEqual(cleaned.properties.$initial_person_info, { r: '$direct', u: 'https://app.example/a' });
  assert.deepEqual(cleaned.properties.list, ['/b']);
  assert.doesNotMatch(JSON.stringify(cleaned), /authCode|code=/);
  assert.equal(cleaned.$set_once!.$initial_current_url, 'https://app.example/');
  assert.equal(cleaned.$set_once!.$initial_referrer, '$direct');
  // The original event is not changed
  assert.match(event.properties.$current_url, /authCode/);
});

test('cleanCapture drops events from audience pages', () => {
  assert.equal(cleanCapture({ properties: { $pathname: '/word-cloud/join/ABC' } }), null);
  assert.equal(cleanCapture({ properties: { $current_url: 'https://app.example/word-cloud/join/ABC?x=1' } }), null);
  assert.equal(cleanCapture(null), null);
});

test('trackEvent sends nothing without a loaded client, and never queues before consent', () => {
  const sent: unknown[] = [];
  setAnalyticsClient(null);
  trackEvent('workflow_saved', { auto_upload: true });
  setAnalyticsClient({ capture: (...args) => sent.push(args) });
  assert.deepEqual(sent, []);
  setAnalyticsClient(null);
});

test('trackEvent sends listed properties only', () => {
  const sent: unknown[] = [];
  setAnalyticsClient({ capture: (...args) => sent.push(args) });
  trackEvent('sync_rule_saved', { is_new: true, has_tags: false, matchText: 'SOH', email: 'a@b.c' });
  trackEvent('admin_page_viewed', { tempPassword: 'x' });
  assert.deepEqual(sent, [
    ['sync_rule_saved', { is_new: true, has_tags: false }],
    ['admin_page_viewed', {}],
  ]);
  setAnalyticsClient(null);
});

test('events of the first moments wait while PostHog loads', () => {
  const sent: unknown[] = [];
  beginAnalyticsLoad();
  trackEvent('admin_page_viewed');
  assert.deepEqual(sent, []);
  setAnalyticsClient({ capture: (...args) => sent.push(args) });
  assert.deepEqual(sent, [['admin_page_viewed', {}]]);
  setAnalyticsClient(null);
  // Withdrawn: nothing is kept any more
  trackEvent('admin_page_viewed');
  setAnalyticsClient({ capture: (...args) => sent.push(args) });
  assert.equal(sent.length, 1);
  setAnalyticsClient(null);
});

test('a failing client never breaks the page', () => {
  setAnalyticsClient({ capture: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => trackEvent('manual_sync_opened'));
  setAnalyticsClient(null);
});
