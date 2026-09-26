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

// Events sent on purpose from the UI (P2-8c; the backend sends the rest).
// Only these names and, for each, only these properties with plain values.
export const FRONTEND_EVENTS = {
  workflow_saved: ['auto_upload', 'has_description_template', 'captions_enabled'],
  sync_rule_saved: ['is_new', 'has_playlist', 'has_publish_delay', 'has_tags', 'has_caption_language'],
  manual_sync_opened: [],
  admin_page_viewed: [],
} as const satisfies Record<string, readonly string[]>;

export type FrontendEvent = keyof typeof FRONTEND_EVENTS;
type PlainValue = string | number | boolean | null;

export function sanitizeEventProperties(event: FrontendEvent, properties: Record<string, unknown> = {}) {
  const clean: Record<string, PlainValue> = {};
  for (const key of FRONTEND_EVENTS[event] as readonly string[]) {
    const value = properties[key];
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      clean[key] = value;
    } else if (typeof value === 'string') {
      clean[key] = value.slice(0, 64);
    }
  }
  return clean;
}

interface AnalyticsClient {
  capture(event: string, properties?: Record<string, unknown>): unknown;
}

// Set by PostHogAnalytics once PostHog is loaded for an account that agreed
let client: AnalyticsClient | null = null;
// Events of the first moments, while PostHog loads (consent already given)
let pending: { event: FrontendEvent; properties: Record<string, PlainValue> }[] | null = null;
const MAX_PENDING = 20;

/** PostHog is being loaded for an account that agreed: keep early events. */
export function beginAnalyticsLoad() {
  if (!client) pending = pending ?? [];
}

/** The loaded client, or null when consent is withdrawn or on sign-out. */
export function setAnalyticsClient(next: AnalyticsClient | null) {
  client = next;
  const queued = pending;
  pending = null;
  if (next) for (const { event, properties } of queued ?? []) send(event, properties);
}

/** Sends a listed UI event, or nothing at all without consent. Never throws. */
export function trackEvent(event: FrontendEvent, properties: Record<string, unknown> = {}) {
  const clean = sanitizeEventProperties(event, properties);
  if (client) send(event, clean);
  else if (pending && pending.length < MAX_PENDING) pending.push({ event, properties: clean });
}

function send(event: FrontendEvent, properties: Record<string, PlainValue>) {
  try {
    client?.capture(event, properties);
  } catch {
    // Analytics must never break the page
  }
}
