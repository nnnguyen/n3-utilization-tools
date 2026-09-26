// Vercel Web Analytics / Speed Insights `beforeSend` (docs/IMPLEMENTATION_PLAN.ai.md P2-7):
// query strings and fragments never leave the browser — /login?authCode=… and
// /settings/integrations?code=… carry one-time sign-in and OAuth codes — and
// super admins' own visits are not counted.

export function withoutQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split(/[?#]/)[0];
  }
}

export function filterAnalyticsEvent<T extends { url: string }>(
  event: T,
  options: { skip: boolean },
): T | null {
  if (options.skip) return null;
  return { ...event, url: withoutQuery(event.url) };
}
