import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCapture, isUntrackedPath, shouldTrack } from './product-analytics.ts';

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
