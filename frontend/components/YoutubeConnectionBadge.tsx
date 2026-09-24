'use client';

import React from 'react';
import { Badge, Tag, Tooltip } from 'antd';
import Link from 'next/link';
import { useT } from '@/lib/i18n';

export interface YoutubeStatus {
  connected: boolean;
  reason?: 'not_configured' | 'invalid_credentials' | 'token_expired';
  channelTitle?: string;
}

// Compact connection indicator; full details live in Integrations → YouTube
export default function YoutubeConnectionBadge({ status, checking }: { status: YoutubeStatus | null; checking: boolean }) {
  const t = useT();
  const badge = checking
    ? <Badge status="processing" text={t('ytBadge.checking')} />
    : status?.connected
      ? <Badge status="success" text={status.channelTitle || t('ytBadge.connected')} />
      : <Badge status="error" text={t('ytBadge.notConnected')} />;
  return (
    <Tooltip title={t('ytBadge.tooltip')}>
      <Link href="/settings/integrations?tab=youtube">
        <Tag style={{ cursor: 'pointer', padding: '2px 10px', fontSize: 13 }}>{badge}</Tag>
      </Link>
    </Tooltip>
  );
}
