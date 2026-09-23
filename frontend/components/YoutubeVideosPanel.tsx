'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Space, Button, Alert, Tooltip } from 'antd';
import { ReloadOutlined, LinkOutlined, EditOutlined, HistoryOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import EditVideoModal from './EditVideoModal';
import SyncHistoryModal from './SyncHistoryModal';
import { apiFetch } from '@/lib/api';

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

const PRIVACY_TAG: Record<string, { color: string; label: string }> = {
  public: { color: 'green', label: 'Public' },
  unlisted: { color: 'blue', label: 'Unlisted' },
  private: { color: 'orange', label: 'Private' },
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
const formatCount = (n: number | null, hiddenLabel: string) =>
  n == null ? <Tooltip title={hiddenLabel}><Text type="secondary">—</Text></Tooltip> : n.toLocaleString();

// Channel Content → Videos: every video on the channel, served from the backend cache
export default function YoutubeVideosPanel({ connected, checking }: { connected: boolean; checking: boolean }) {
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
    setError(data.refreshError ? `Không cập nhật được từ YouTube, đang hiện dữ liệu cũ: ${data.refreshError}` : null);
  };

  const load = async () => {
    setLoading(true);
    try {
      apply(await apiFetch('/youtube/channel/videos'));
    } catch (e: any) {
      setError(e.message || 'Không tải được danh sách video');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      apply(await apiFetch('/youtube/channel/videos/refresh', { method: 'POST' }));
    } catch (e: any) {
      setError(e.message || 'Không cập nhật được danh sách video');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (connected) load();
  }, [connected]);

  const columns = [
    {
      title: 'Thumbnail',
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      width: 120,
      render: (url: string | null) => url
        ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} />
        : <div style={{ width: 100, height: 56, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>No Image</div>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: ChannelVideo) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{title}</Text>
          {record.zoomSync && (
            <Tooltip title={`Sync từ Zoom recording "${record.zoomSync.meeting}"`}>
              <Tag icon={<VideoCameraOutlined />} color="geekblue" style={{ cursor: 'help' }}>Zoom</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Views',
      dataIndex: 'viewCount',
      key: 'viewCount',
      align: 'right' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.viewCount ?? -1) - (b.viewCount ?? -1),
      render: (n: number | null) => formatCount(n, 'Không có dữ liệu'),
    },
    {
      title: 'Comments',
      dataIndex: 'commentCount',
      key: 'commentCount',
      align: 'right' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.commentCount ?? -1) - (b.commentCount ?? -1),
      render: (n: number | null) => formatCount(n, 'Bình luận đã bị tắt'),
    },
    {
      title: 'Likes',
      dataIndex: 'likeCount',
      key: 'likeCount',
      align: 'right' as const,
      render: (n: number | null) => formatCount(n, 'Số like đang bị ẩn'),
    },
    {
      title: 'Visibility',
      dataIndex: 'privacyStatus',
      key: 'privacyStatus',
      render: (value: string | null) =>
        value ? <Tag color={PRIVACY_TAG[value]?.color}>{PRIVACY_TAG[value]?.label || value}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Duration',
      dataIndex: 'durationSeconds',
      key: 'durationSeconds',
      align: 'right' as const,
      render: formatDuration,
    },
    {
      title: 'Published Date',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      defaultSortOrder: 'descend' as const,
      sorter: (a: ChannelVideo, b: ChannelVideo) => (a.publishedAt || '').localeCompare(b.publishedAt || ''),
      render: (date: string | null) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ChannelVideo) => (
        <Space wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditingVideoId(record.videoId)}>
            Edit
          </Button>
          <Button size="small" icon={<LinkOutlined />} href={`https://www.youtube.com/watch?v=${record.videoId}`} target="_blank">
            View on YouTube
          </Button>
          {record.zoomSync?.recordingId && (
            <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryFor(record)}>
              Xem sync log
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
          Toàn bộ video trên kênh (kể cả private/unlisted và video không upload qua app này).
          {lastFetchedAt && <> Cập nhật lúc: {dayjs(lastFetchedAt).format('YYYY-MM-DD HH:mm')}.</>}
        </Text>
        <Tooltip title="Lấy lại dữ liệu mới nhất từ YouTube (tự động làm mới khi dữ liệu cũ hơn 1 giờ)">
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={refreshing} disabled={!connected || loading}>
            Refresh
          </Button>
        </Tooltip>
      </div>

      {error && <Alert type="warning" showIcon title={error} style={{ marginBottom: 16 }} />}

      <Table
        columns={columns}
        dataSource={videos}
        rowKey="videoId"
        loading={loading || refreshing || checking}
        locale={{ emptyText: connected ? 'Kênh chưa có video nào' : 'Kết nối YouTube để xem danh sách video' }}
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
