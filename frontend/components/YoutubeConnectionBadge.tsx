'use client';

import React from 'react';
import { Badge, Tag, Tooltip } from 'antd';
import Link from 'next/link';

export interface YoutubeStatus {
  connected: boolean;
  reason?: 'not_configured' | 'invalid_credentials' | 'token_expired';
  channelTitle?: string;
}

// Compact connection indicator; full details live in Integrations → YouTube
export default function YoutubeConnectionBadge({ status, checking }: { status: YoutubeStatus | null; checking: boolean }) {
  const badge = checking
    ? <Badge status="processing" text="Đang kiểm tra kết nối..." />
    : status?.connected
      ? <Badge status="success" text={status.channelTitle || 'Connected'} />
      : <Badge status="error" text="Chưa kết nối" />;
  return (
    <Tooltip title="Xem chi tiết kết nối trong Integrations">
      <Link href="/integrations?tab=youtube">
        <Tag style={{ cursor: 'pointer', padding: '2px 10px', fontSize: 13 }}>{badge}</Tag>
      </Link>
    </Tooltip>
  );
}
