'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Space, Button, Alert, Tooltip } from 'antd';
import { ReloadOutlined, LinkOutlined, EditOutlined, HistoryOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import EditVideoModal from './EditVideoModal';
import SyncHistoryModal from './SyncHistoryModal';
import { apiFetch } from '@/lib/api';
import { useFormat, useT, type MessageKey } from '@/lib/i18n';

const { Text } = Typography;

interface ChannelVideo {
  videoId: string;
  title: string;
  thumbnail: string | null;
  privacyStatus: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string | null;
  // Set when the video came from a Zoom recording synced by this app
  zoomSync: { recordingId: string | null; meeting: string } | null;
}

const PRIVACY_TAG: Record<string, { color: string; label: MessageKey }> = {
  public: { color: 'green', label: 'privacy.public' },
  unlisted: { color: 'blue', label: 'privacy.unlisted' },
  private: { color: 'orange', label: 'privacy.private' },
};

// 3725 -> "1:02:05", 933 -> "15:33"
const formatDuration = (seconds: number | null) => {
  if (seconds == null) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// null = hidden by the owner (likes) or disabled (comments)
const formatCount = (n: number | null, hiddenLabel: string, formatNumber: (n: number) => string) =>
  n == null ? <Tooltip title={hiddenLabel}><Text type="secondary">—</Text></Tooltip> : formatNumber(n);

// Channel Content → Videos: every video on the channel, served from the backend cache
export default function YoutubeVideosPanel({ connected, checking }: { connected: boolean; checking: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<ChannelVideo | null>(null);

  const apply = (data: any) => {
    setVideos(data.videos || []);
    setLastFetchedAt(data.lastFetchedAt);
    // The backend still returns the previous cache when a refresh fails
    setError(data.refreshError ? t('videos.staleError', { error: data.refreshError }) : null);
  };

  const load = async () => {
    setLoading(true);
    try {
      apply(await apiFetch('/youtube/channel/videos'));
    } catch (e: any) {
      setError(e.message || t('videos.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      apply(await apiFetch('/youtube/channel/videos/refresh', { method: 'POST' }));
    } catch (e: any) {
      setError(e.message || t('videos.refreshFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (connected) load();
  }, [connected]);

  const columns = [
    {
      title: t('col.thumbnail'),
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      width: 120,
      render: (url: string | null) => url
        ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} />
        : <div style={{ width: 100, height: 56, background: 'var(--color-divider)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{t('common.noImage')}</div>,
    },
    {
      title: t('col.title'),
      dataIndex: 'title',
      key: 'title',
      sorter: (a: ChannelVideo, b: ChannelVideo) => a.title.localeCompare(b.title),
      render: (title: string, record: ChannelVideo) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{title}</Text>
          {record.zoomSync && (
            <Tooltip title={t('videos.fromZoom', { meeting: record.zoomSync.meeting })}>
              <Tag icon={<VideoCameraOutlined />} color="geekblue" style={{ cursor: 'help' }}>Zoom</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('col.views'),
      dataIndex: 'viewCount',
      key: 'viewCount',
      align: 'right' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.viewCount ?? -1) - (b.viewCount ?? -1),
      render: (n: number | null) => formatCount(n, t('videos.noData'), fmt.number),
    },
    {
      title: t('col.comments'),
      dataIndex: 'commentCount',
      key: 'commentCount',
      align: 'right' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.commentCount ?? -1) - (b.commentCount ?? -1),
      render: (n: number | null) => formatCount(n, t('videos.commentsOff'), fmt.number),
    },
    {
      title: t('col.likes'),
      dataIndex: 'likeCount',
      key: 'likeCount',
      align: 'right' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.likeCount ?? -1) - (b.likeCount ?? -1),
      render: (n: number | null) => formatCount(n, t('videos.likesHidden'), fmt.number),
    },
    {
      title: t('col.visibility'),
      dataIndex: 'privacyStatus',
      key: 'privacyStatus',
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.privacyStatus || '').localeCompare(b.privacyStatus || ''),
      render: (value: string | null) =>
        value ? <Tag color={PRIVACY_TAG[value]?.color}>{PRIVACY_TAG[value] ? t(PRIVACY_TAG[value].label) : value}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: t('col.duration'),
      dataIndex: 'durationSeconds',
      key: 'durationSeconds',
      align: 'right' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.durationSeconds ?? -1) - (b.durationSeconds ?? -1),
      render: formatDuration,
    },
    {
      title: t('col.publishedDate'),
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      defaultSortOrder: 'descend' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.publishedAt || '').localeCompare(b.publishedAt || ''),
      render: (date: string | null) => date ? fmt.dateTime(date) : '-',
    },
    {
      title: t('col.actions'),
      key: 'actions',
      render: (_: any, record: ChannelVideo) => (
        <Space wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditingVideoId(record.videoId)}>
            {t('common.edit')}
          </Button>
          <Button size="small" icon={<LinkOutlined />} href={`https://www.youtube.com/watch?v=${record.videoId}`} target="_blank">
            {t('common.viewOnYouTube')}
          </Button>
          {record.zoomSync?.recordingId && (
            <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryFor(record)}>
              {t('common.viewSyncLog')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Text type="secondary">
          {t('videos.intro')}
          {lastFetchedAt && <> {t('videos.updatedAt', { time: dayjs(lastFetchedAt).format('YYYY-MM-DD HH:mm') })}</>}
        </Text>
        <Tooltip title={t('videos.refreshTooltip')}>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={refreshing} disabled={!connected || loading}>
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error && <Alert type="warning" showIcon title={error} style={{ marginBottom: 16 }} />}

      <Table
        columns={columns}
        dataSource={videos}
        rowKey="videoId"
        loading={loading || refreshing || checking}
        locale={{ emptyText: connected ? t('videos.emptyConnected') : t('videos.emptyNotConnected') }}
      />

      <EditVideoModal
        videoId={editingVideoId}
        open={!!editingVideoId}
        onClose={() => setEditingVideoId(null)}
        onSaved={(video) => {
          // The backend cache is updated too; mirror it without refetching
          setVideos(prev => prev.map(v => v.videoId === video.id
            ? { ...v, title: video.title, privacyStatus: video.privacyStatus, thumbnail: video.thumbnail || v.thumbnail }
            : v));
        }}
      />

      <SyncHistoryModal
        open={!!historyFor}
        recordingId={historyFor?.zoomSync?.recordingId ?? null}
        topic={historyFor?.zoomSync?.meeting}
        onClose={() => setHistoryFor(null)}
      />
    </>
  );
}
