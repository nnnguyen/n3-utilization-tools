import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterAnalyticsEvent, withoutQuery } from './analytics-filter.ts';

test('withoutQuery drops one-time codes and fragments', () => {
  assert.equal(
    withoutQuery('https://frontend.vercel.app/login?authCode=abc123'),
    'https://frontend.vercel.app/login',
  );
  assert.equal(
    withoutQuery('https://frontend.vercel.app/settings/integrations?code=4/0Ab&scope=x#top'),
    'https://frontend.vercel.app/settings/integrations',
  );
  assert.equal(withoutQuery('/login?authCode=abc'), '/login');
});

test('filterAnalyticsEvent keeps the rest of the event', () => {
  assert.deepEqual(
    filterAnalyticsEvent({ type: 'pageview', url: 'https://a.app/admin?x=1' }, { skip: false }),
    { type: 'pageview', url: 'https://a.app/admin' },
  );
});

test('filterAnalyticsEvent drops events while skipped (super admin)', () => {
  assert.equal(filterAnalyticsEvent({ type: 'pageview', url: 'https://a.app/' }, { skip: true }), null);
});
