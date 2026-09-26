'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { useAuth } from '@/lib/auth-context';
import {
  beginAnalyticsLoad,
  cleanCapture,
  POSTHOG_API_HOST,
  POSTHOG_UI_HOST,
  setAnalyticsClient,
  shouldTrack,
} from '@/lib/product-analytics';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Product analytics (P2-8, docs/design/P2-8-posthog.md). posthog-js is only
// downloaded once the signed-in account has agreed; identified by the
// internal user id, never the email. Page views, plus the events sent on
// purpose with trackEvent() (P2-8c) and from the backend (P2-8b).
export default function PostHogAnalytics() {
  const { user } = useAuth();
  const pathname = usePathname();
  const posthog = useRef<PostHog | null>(null);
  // Last identity sent: identify() again only when it changes
  const identified = useRef('');
  const consent = user?.preferences?.analyticsConsent;

  // Before any page's own effects: a page tracking an event as it opens (e.g.
  // admin_page_viewed) must find the queue ready while PostHog loads
  useLayoutEffect(() => {
    if (!posthog.current && user && shouldTrack({ key: POSTHOG_KEY, consent, pathname })) beginAnalyticsLoad();
  }, [user?.id, consent, pathname]);

  useEffect(() => {
    const client = posthog.current;
    // Signed out or consent withdrawn: forget this browser's identity, then
    // stop (reset() clears the opt-out, so it comes first)
    if (client && (!user || consent !== true)) {
      setAnalyticsClient(null);
      client.reset();
      client.opt_out_capturing();
      identified.current = '';
      return;
    }
    if (!user || !shouldTrack({ key: POSTHOG_KEY, consent, pathname })) return;

    let cancelled = false;
    (async () => {
      let instance = posthog.current;
      if (!instance) {
        beginAnalyticsLoad();
        const { default: loaded } = await import('posthog-js');
        if (cancelled) return;
        loaded.init(POSTHOG_KEY!, {
          api_host: POSTHOG_API_HOST,
          ui_host: POSTHOG_UI_HOST,
          person_profiles: 'identified_only',
          capture_pageview: 'history_change',
          capture_pageleave: false,
          autocapture: false,
          rageclick: false,
          capture_dead_clicks: false,
          capture_heatmaps: false,
          capture_exceptions: false,
          capture_performance: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_web_experiments: true,
          advanced_disable_flags: true,
          before_send: cleanCapture,
        });
        posthog.current = instance = loaded;
      }
      if (instance.has_opted_out_capturing()) instance.opt_in_capturing();
      const properties = {
        language: user.preferences?.language,
        theme_style: user.preferences?.themeStyle,
        platform_role: user.platformRole ?? 'user',
      };
      const identity = JSON.stringify([user.id, properties]);
      if (identified.current !== identity) {
        identified.current = identity;
        instance.identify(user.id, properties);
      }
      setAnalyticsClient(instance);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, consent, pathname, user?.preferences?.language, user?.preferences?.themeStyle, user?.platformRole]);

  return null;
}
