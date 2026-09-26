// Product analytics with PostHog (docs/design/P2-8-posthog.md). Nothing is
// loaded without a key and the account's consent; no autocapture, no replay;
// query strings never leave the browser; the public Word Cloud audience pages
// are never tracked.
import { withoutQuery } from './analytics-filter.ts';

// Same-origin proxy (next.config.ts rewrites) to PostHog Cloud EU
export const POSTHOG_API_HOST = '/ingest';
export const POSTHOG_UI_HOST = 'https://eu.posthog.com';

// Audience pages of Word Cloud: open to anyone with the code
export function isUntrackedPath(pathname: string | null | undefined): boolean {
  return !!pathname && /^\/word-cloud\/join(\/|$)/.test(pathname);
}

export function shouldTrack(input: {
  key: string | undefined;
  consent: boolean | null | undefined;
  pathname: string | null | undefined;
}): boolean {
  return !!input.key && input.consent === true && !isUntrackedPath(input.pathname);
}

type Properties = Record<string, unknown>;

// Any URL-looking value with a query or fragment: PostHog copies the landing
// URL into many properties ($current_url, $session_entry_url, $initial_*,
// $initial_person_info.u, …), so none is trusted by name
const URL_WITH_QUERY = /^(https?:\/\/|\/)[^\s]*[?#]/;

function cleanUrls<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return (URL_WITH_QUERY.test(value) ? withoutQuery(value) : value) as T;
  if (depth > 3 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => cleanUrls(item, depth + 1)) as T;
  return Object.fromEntries(
    Object.entries(value as Properties).map(([key, item]) => [key, cleanUrls(item, depth + 1)]),
  ) as T;
}

// `before_send`: drops events of untracked pages, strips query strings
export function cleanCapture<T extends { properties: Properties; $set?: Properties; $set_once?: Properties }>(
  event: T | null,
): T | null {
  if (!event) return null;
  const pathname = event.properties?.$pathname;
  if (typeof pathname === 'string' && isUntrackedPath(pathname)) return null;
  const url = event.properties?.$current_url;
  if (typeof url === 'string') {
    try {
      if (isUntrackedPath(new URL(url, 'http://x').pathname)) return null;
    } catch {
      // Not a URL: nothing to check
    }
  }
  return {
    ...event,
    properties: cleanUrls(event.properties),
    ...(event.$set ? { $set: cleanUrls(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: cleanUrls(event.$set_once) } : {}),
  };
}
