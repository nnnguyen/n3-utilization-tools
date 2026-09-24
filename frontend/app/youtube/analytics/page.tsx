'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Select, Space, Alert, Button, Tooltip } from 'antd';
import { ReloadOutlined, LinkOutlined, InfoCircleOutlined, ArrowRightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import dayjs from 'dayjs';
import DashboardLayout from '../../../components/DashboardLayout';
import YoutubeTokenBanner from '../../../components/YoutubeTokenBanner';
import YoutubeConnectionBadge, { type YoutubeStatus } from '../../../components/YoutubeConnectionBadge';
import { YoutubePageTitle } from '../../../components/BrandLogos';
import MonthlyBarChart, { type MonthlyPoint } from '../../../components/MonthlyBarChart';
import { apiFetch } from '@/lib/api';

const { Text } = Typography;

interface ChannelVideo {
  videoId: string;
  title: string;
  thumbnail: string | null;
  privacyStatus: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string | null;
}

// Same colors as the Public/Unlisted/Private tags used in every video table
const VISIBILITY = [
  { key: 'public', label: 'Public', color: '#52c41a' },
  { key: 'unlisted', label: 'Unlisted', color: '#1677ff' },
  { key: 'private', label: 'Private', color: '#fa8c16' },
] as const;

const sum = (videos: ChannelVideo[], field: 'viewCount' | 'likeCount' | 'commentCount') =>
  videos.reduce((total, v) => total + (v[field] ?? 0), 0);

export default function YoutubeAnalyticsPage() {
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);

  const connected = status?.connected ?? false;

  const apply = (data: any) => {
    setVideos(data.videos || []);
    setLastFetchedAt(data.lastFetchedAt);
    setStale(!!data.stale);
    setError(data.refreshError ? `Không cập nhật được từ YouTube: ${data.refreshError}` : null);
  };

  // Reads the Videos-tab cache only; never calls YouTube (no quota)
  const loadCache = async () => {
    setLoading(true);
    try {
      apply(await apiFetch('/youtube/channel/videos?cacheOnly=true'));
    } catch (e: any) {
      setError(e.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  // Same refresh endpoint as the Videos tab
  const refreshNow = async () => {
    setRefreshing(true);
    try {
      apply(await apiFetch('/youtube/channel/videos/refresh', { method: 'POST' }));
    } catch (e: any) {
      setError(e.message || 'Không cập nhật được dữ liệu');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const data = await apiFetch('/youtube/status');
        setStatus(data);
        if (data.connected) loadCache();
      } catch {
        setStatus({ connected: false, reason: 'invalid_credentials' });
      } finally {
        setCheckingStatus(false);
      }
    };
    init();
  }, []);

  const topVideos = useMemo(
    () => [...videos].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, 10),
    [videos],
  );

  // Videos published per month, from the 1st of the oldest month shown (same window as Dashboard)
  const monthly = useMemo<MonthlyPoint[]>(() => {
    const start = dayjs().startOf('month').subtract(months - 1, 'month');
    const buckets: MonthlyPoint[] = Array.from({ length: months }, (_, i) => ({
      month: start.add(i, 'month').format('YYYY-MM'),
      value: 0,
    }));
    const byMonth = new Map(buckets.map(b => [b.month, b]));
    for (const v of videos) {
      if (!v.publishedAt) continue;
      const bucket = byMonth.get(dayjs(v.publishedAt).format('YYYY-MM'));
      if (bucket) bucket.value++;
    }
    return buckets;
  }, [videos, months]);

  const visibility = useMemo(
    () => VISIBILITY.map(v => ({ ...v, count: videos.filter(x => x.privacyStatus === v.key).length })),
    [videos],
  );

  const hasCache = !!lastFetchedAt;
  const likesHidden = videos.filter(v => v.likeCount == null).length;
  const commentsOff = videos.filter(v => v.commentCount == null).length;

  const topColumns = [
    {
      title: 'Thumbnail',
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      width: 120,
      render: (url: string | null) => url
        ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} />
        : <div style={{ width: 100, height: 56, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>No Image</div>,
    },
    { title: 'Title', dataIndex: 'title', key: 'title', render: (t: string) => <Text strong>{t}</Text> },
    { title: 'Views', dataIndex: 'viewCount', key: 'viewCount', align: 'right' as const, render: (n: number | null) => n?.toLocaleString() ?? '—' },
    { title: 'Comments', dataIndex: 'commentCount', key: 'commentCount', align: 'right' as const, render: (n: number | null) => n?.toLocaleString() ?? '—' },
    { title: 'Likes', dataIndex: 'likeCount', key: 'likeCount', align: 'right' as const, render: (n: number | null) => n?.toLocaleString() ?? '—' },
    {
      title: 'Published Date',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      render: (date: string | null) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: '',
      key: 'view',
      render: (_: any, record: ChannelVideo) => (
        <Button
          size="small"
          icon={<LinkOutlined />}
          href={`https://www.youtube.com/watch?v=${record.videoId}`}
          target="_blank"
          onClick={(e) => e.stopPropagation()}
        >
          View on YouTube
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Space size="middle" align="center" wrap>
          <YoutubePageTitle title="Analytics" />
          <YoutubeConnectionBadge status={status} checking={checkingStatus} />
        </Space>
        <Space wrap>
          {lastFetchedAt && <Text type="secondary">Dữ liệu lúc {dayjs(lastFetchedAt).format('YYYY-MM-DD HH:mm')}</Text>}
          <Tooltip title="Lấy lại dữ liệu mới nhất từ YouTube (cùng nút Refresh ở tab Videos)">
            <Button icon={<ReloadOutlined />} onClick={refreshNow} loading={refreshing} disabled={!connected || loading}>
              Refresh now
            </Button>
          </Tooltip>
        </Space>
      </div>

      <YoutubeTokenBanner />

      {connected && !loading && !hasCache && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Chưa có dữ liệu video của kênh"
          description={<>Bấm <b>Refresh now</b> hoặc mở tab <Link href="/youtube/channel-content?tab=videos">Channel Content → Videos</Link> để tải danh sách video lần đầu.</>}
          action={<Button type="primary" size="small" onClick={refreshNow} loading={refreshing}>Refresh now</Button>}
        />
      )}
      {connected && hasCache && stale && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`Số liệu đang là dữ liệu lưu lúc ${dayjs(lastFetchedAt).format('YYYY-MM-DD HH:mm')} (hơn 1 giờ trước)`}
          description={<>Bấm <b>Refresh now</b> ở đây hoặc Refresh ở tab <Link href="/youtube/channel-content?tab=videos">Videos</Link> để cập nhật.</>}
          action={<Button size="small" onClick={refreshNow} loading={refreshing}>Refresh now</Button>}
        />
      )}
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        {/* 1. Totals */}
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} style={{ height: '100%' }}>
            <Statistic title="Tổng số video" value={videos.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} style={{ height: '100%' }}>
            <Statistic title="Tổng views" value={sum(videos, 'viewCount')} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} style={{ height: '100%' }}>
            <Statistic title="Tổng comments" value={sum(videos, 'commentCount')} />
            {commentsOff > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{commentsOff} video tắt bình luận (không tính)</Text>}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} style={{ height: '100%' }}>
            <Statistic title="Tổng likes" value={sum(videos, 'likeCount')} />
            {likesHidden > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{likesHidden} video ẩn số like (không tính)</Text>}
          </Card>
        </Col>

        {/* 5. Visibility breakdown */}
        <Col span={24}>
          <Card title="Phân bổ theo Visibility" loading={loading}>
            {videos.length > 0 && (
              <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
                {visibility.filter(v => v.count > 0).map(v => (
                  <Tooltip key={v.key} title={`${v.label}: ${v.count}`}>
                    <div style={{ flex: v.count, background: v.color }} />
                  </Tooltip>
                ))}
              </div>
            )}
            <Row gutter={[16, 16]}>
              {visibility.map(v => (
                <Col xs={24} sm={8} key={v.key}>
                  <Space align="start">
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: v.color, marginTop: 6 }} />
                    <Statistic
                      title={v.label}
                      value={v.count}
                      suffix={videos.length ? <Text type="secondary" style={{ fontSize: 14 }}>({Math.round((v.count / videos.length) * 100)}%)</Text> : undefined}
                    />
                  </Space>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* 3. Videos published per month */}
        <Col span={24}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text type="secondary">Khoảng thời gian:</Text>
            <Select
              value={months}
              onChange={setMonths}
              style={{ width: 200 }}
              options={[
                { value: 3, label: '3 tháng gần nhất' },
                { value: 6, label: '6 tháng gần nhất' },
                { value: 12, label: '12 tháng gần nhất' },
              ]}
            />
          </div>
          <MonthlyBarChart
            title="Video published theo tháng"
            valueLabel="Video published"
            loading={loading}
            data={monthly}
            note={
              <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                <InfoCircleOutlined /> Đếm theo ngày published của mọi video trên kênh (kể cả private/unlisted).
              </Text>
            }
          />
        </Col>

        {/* 2. Top videos by views */}
        <Col span={24}>
          <Card
            title="Top 10 video theo lượt xem"
            extra={
              // 4. The full sortable table already lives in Channel Content → Videos
              <Link href="/youtube/channel-content?tab=videos">
                Xem chi tiết toàn bộ video <ArrowRightOutlined />
              </Link>
            }
          >
            <Table
              size="small"
              columns={topColumns}
              dataSource={topVideos}
              rowKey="videoId"
              loading={loading}
              pagination={false}
              onRow={(record) => ({
                onClick: () => window.open(`https://www.youtube.com/watch?v=${record.videoId}`, '_blank', 'noopener,noreferrer'),
                style: { cursor: 'pointer' },
              })}
              locale={{ emptyText: connected ? 'Chưa có dữ liệu video' : 'Kết nối YouTube để xem thống kê' }}
            />
          </Card>
        </Col>
      </Row>

      <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
        <InfoCircleOutlined /> Số liệu tổng quan (views, comments, likes) lấy từ YouTube Data API. Watch time, thời lượng xem trung bình,
        nguồn traffic và nhân khẩu học người xem cần YouTube Analytics API, sẽ có ở giai đoạn sau.
      </Text>
    </DashboardLayout>
  );
}
