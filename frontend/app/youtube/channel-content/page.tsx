'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Card, Tabs, Space } from 'antd';
import { PlaySquareOutlined, VideoCameraOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '../../../components/DashboardLayout';
import YoutubeTokenBanner from '../../../components/YoutubeTokenBanner';
import YoutubeConnectionBadge, { type YoutubeStatus } from '../../../components/YoutubeConnectionBadge';
import { YoutubePageTitle } from '../../../components/BrandLogos';
import YoutubeVideosPanel from '../../../components/YoutubeVideosPanel';
import ZoomRecordingsPanel from '../../../components/ZoomRecordingsPanel';
import YoutubePlaylistsPanel from '../../../components/YoutubePlaylistsPanel';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

const TABS = ['videos', 'zoom-sync', 'playlists'] as const;

function ChannelContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const requested = searchParams.get('tab');
  const activeTab = TABS.includes(requested as any) ? requested! : 'videos';
  const connected = status?.connected ?? false;

  useEffect(() => {
    const check = async () => {
      try {
        setStatus(await apiFetch('/youtube/status'));
      } catch {
        setStatus({ connected: false, reason: 'invalid_credentials' });
      } finally {
        setCheckingStatus(false);
      }
    };
    check();
  }, []);

  // Panels mount when their tab is first opened, so each loads its data (and
  // spends quota) only if the user actually visits it
  const items = [
    {
      key: 'videos',
      label: <Space><PlaySquareOutlined />{t('channel.tabVideos')}</Space>,
      children: <YoutubeVideosPanel connected={connected} checking={checkingStatus} />,
    },
    {
      key: 'zoom-sync',
      label: <Space><VideoCameraOutlined />{t('channel.tabZoomSync')}</Space>,
      children: <ZoomRecordingsPanel />,
    },
    {
      key: 'playlists',
      label: <Space><UnorderedListOutlined />{t('channel.tabPlaylists')}</Space>,
      children: <YoutubePlaylistsPanel connected={connected} checking={checkingStatus} />,
    },
  ];

  return (
    <>
      <Space size="middle" align="center" wrap style={{ marginBottom: 16 }}>
        <YoutubePageTitle title={t('nav.channelContent')} />
        <YoutubeConnectionBadge status={status} checking={checkingStatus} />
      </Space>

      <YoutubeTokenBanner />

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => router.push(`/youtube/channel-content?tab=${key}`)}
          items={items}
        />
      </Card>
    </>
  );
}

export default function ChannelContentPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<Card loading={true} />}>
        <ChannelContent />
      </Suspense>
    </DashboardLayout>
  );
}
