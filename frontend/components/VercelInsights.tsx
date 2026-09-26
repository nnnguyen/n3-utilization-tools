'use client';

import { useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useAuth } from '@/lib/auth-context';
import { filterAnalyticsEvent } from '@/lib/analytics-filter';

// Vercel Web Analytics + Speed Insights (P2-7). Page views and Web Vitals of
// production builds only (mode "auto"); viewed by super admins in the Vercel
// dashboard linked from the Admin page.
export default function VercelInsights() {
  const { user } = useAuth();
  // The scripts register beforeSend once: read the current role at send time
  const isSuperAdmin = useRef(false);
  useEffect(() => {
    isSuperAdmin.current = user?.platformRole === 'super_admin';
  }, [user]);

  return (
    <>
      <Analytics beforeSend={event => filterAnalyticsEvent(event, { skip: isSuperAdmin.current })} />
      <SpeedInsights beforeSend={event => filterAnalyticsEvent(event, { skip: isSuperAdmin.current })} />
    </>
  );
}
