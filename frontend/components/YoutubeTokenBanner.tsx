'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, message } from 'antd';
import { apiFetch } from '@/lib/api';

const POLL_INTERVAL_MS = 60_000;
// Read by the integrations page after the OAuth callback to send the user back
export const AUTH_RETURN_TO_KEY = 'youtubeAuthReturnTo';

export interface YoutubeTokenStatus {
  configured: boolean;
  testingMode: boolean;
  tokenInvalid: boolean;
  expiringSoon: boolean;
  daysRemaining?: number | null;
  expiresAt?: string | null;
}

// Starts the existing OAuth flow; Google redirects to /integrations, which
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
    message.error(error.message || 'Failed to get authorization URL');
  }
}

export default function YoutubeTokenBanner() {
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
        title="Token xác thực YouTube đã hết hạn hoặc bị thu hồi"
        description="Google đã từ chối token hiện tại (invalid_grant). Mọi sync và upload lên YouTube sẽ thất bại cho đến khi bạn Re-authorize."
        action={<Button danger type="primary" onClick={startYoutubeReauthorize}>Re-authorize</Button>}
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
        title={`Token xác thực sắp hết hạn (còn ${status.daysRemaining ?? 0} ngày) — vui lòng Re-authorize để tránh gián đoạn sync`}
        action={<Button onClick={startYoutubeReauthorize}>Re-authorize</Button>}
      />
    );
  }

  return null;
}
