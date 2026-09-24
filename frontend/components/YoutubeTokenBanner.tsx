'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, message } from 'antd';
import { apiFetch } from '@/lib/api';
import { translateNow, useT } from '@/lib/i18n';

const POLL_INTERVAL_MS = 60_000;
// Read by Settings → Integrations after the OAuth callback to send the user back
export const AUTH_RETURN_TO_KEY = 'youtubeAuthReturnTo';

export interface YoutubeTokenStatus {
  configured: boolean;
  testingMode: boolean;
  tokenInvalid: boolean;
  expiringSoon: boolean;
  daysRemaining?: number | null;
  expiresAt?: string | null;
}

// Starts the existing OAuth flow; Google redirects to /settings/integrations, which
// then returns to the page the user came from.
export async function startYoutubeReauthorize() {
  try {
    try {
      sessionStorage.setItem(AUTH_RETURN_TO_KEY, window.location.pathname);
    } catch {
      // Storage unavailable: the user just stays on Integrations afterwards
    }
    const { url } = await apiFetch('/youtube/auth-url');
    window.location.href = url;
  } catch (error: any) {
    message.error(error.message || translateNow('ytToken.authUrlFailed'));
  }
}

export default function YoutubeTokenBanner() {
  const t = useT();
  const [status, setStatus] = useState<YoutubeTokenStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch('/youtube/token-status', { silent: true });
        setStatus(data);
      } catch {
        // Silent: the banner must never break the page
      }
    };
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!status?.configured) return null;

  if (status.tokenInvalid) {
    return (
      <Alert
        type="error"
        showIcon
        banner
        style={{ marginBottom: 16 }}
        title={t('ytToken.invalidTitle')}
        description={t('ytToken.invalidDesc')}
        action={<Button danger type="primary" onClick={startYoutubeReauthorize}>{t('ytToken.reauthorize')}</Button>}
      />
    );
  }

  if (status.expiringSoon) {
    return (
      <Alert
        type="warning"
        showIcon
        banner
        style={{ marginBottom: 16 }}
        title={t('ytToken.expiringTitle', { days: status.daysRemaining ?? 0 })}
        action={<Button onClick={startYoutubeReauthorize}>{t('ytToken.reauthorize')}</Button>}
      />
    );
  }

  return null;
}
