'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Select, Space, Alert, Button, Progress, Tooltip, message } from 'antd';
import { ReloadOutlined, InfoCircleOutlined, UploadOutlined, LinkOutlined, EditOutlined } from '@ant-design/icons';
import DashboardLayout from '../../../components/DashboardLayout';
import EditVideoModal from '../../../components/EditVideoModal';
import UploadVideoModal from '../../../components/UploadVideoModal';
import YoutubeTokenBanner from '../../../components/YoutubeTokenBanner';
import YoutubeConnectionBadge, { type YoutubeStatus } from '../../../components/YoutubeConnectionBadge';
import { YoutubePageTitle } from '../../../components/BrandLogos';
import Link from 'next/link';
import MonthlyBarChart from '../../../components/MonthlyBarChart';
import { apiFetch } from '@/lib/api';

const { Text } = Typography;

// Same buffered cost the backend uses for one upload (1600 official + buffer)
const UPLOAD_COST = 1650;

interface YoutubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  privacyStatus: string;
}

interface YoutubeQuota {
  unitsUsed: number;
  unitsRemaining: number;
  quotaLimit: number;
  estimatedUploadsRemaining: number;
  date: string;
}

interface YoutubeStats {
  monthly: { month: string; completed: number }[];
  totals: { completedVideos: number; totalBytes: number; totalDurationSeconds: number };
  rates: {
    completed: number;
    failed: number;
    inProgress: number;
    successRate: number | null;
    totalAttempts: number;
    totalFailures: number;
    attemptFailureRate: number | null;
  };
  quota: { averageUnitsPerDay: number; daysSampled: number };
  topFailing: {
    recordingId: string;
    meeting: string;
    failureCount: number;
    attemptCount: number;
    syncStatus: string;
    syncError: string | null;
    syncStartedAt: string | null;
  }[];
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 2 : 0)} ${units[i]}`;
};

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const getQuotaColor = (percent: number) => {
  if (percent < 70) return '#52c41a'; // xanh
  if (percent < 90) return '#faad14'; // vàng
  return '#ff4d4f'; // đỏ
};

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  COMPLETED: { color: 'success', label: 'Ready' },
  FAILED: { color: 'error', label: 'Failed' },
  UPLOADING: { color: 'blue', label: 'Uploading' },
  PROCESSING: { color: 'warning', label: 'Processing' },
  PENDING: { color: 'default', label: 'Pending' },
};

export default function YoutubeDashboardPage() {
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [quota, setQuota] = useState<YoutubeQuota | null>(null);
  const [stats, setStats] = useState<YoutubeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [recentUploads, setRecentUploads] = useState<YoutubeVideo[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [months, setMonths] = useState(6);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const isConnected = status?.connected ?? false;
  const hasEnoughQuota = quota ? quota.unitsRemaining >= UPLOAD_COST : true;

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const data = await apiFetch('/youtube/status');
      setStatus(data);
      return data as YoutubeStatus;
    } catch (error) {
      setStatus({ connected: false, reason: 'invalid_credentials' });
      return null;
    } finally {
      setCheckingStatus(false);
    }
  };

  const fetchQuota = async () => {
    try {
      const data = await apiFetch('/youtube/quota');
      setQuota(data);
    } catch (error) {
      console.error('Failed to fetch quota', error);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await apiFetch(`/youtube/stats?months=${months}`);
      setStats(data);
    } catch (e: any) {
      setStatsError(e.message || 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchRecentUploads = async () => {
    setLoadingUploads(true);
    try {
      const data = await apiFetch(`/youtube/recent-uploads?months=${months}`);
      setRecentUploads(data);
    } catch (error) {
      console.error('Failed to fetch recent uploads', error);
      message.error('Failed to fetch recent uploads');
    } finally {
      setLoadingUploads(false);
    }
  };

  const refreshAll = () => {
    fetchStats();
    fetchQuota();
    if (isConnected) fetchRecentUploads();
  };

  useEffect(() => {
    checkStatus().then((data) => {
      if (data?.connected) fetchQuota();
    });
  }, []);

  // The time filter drives both the chart and Recent Uploads
  useEffect(() => {
    fetchStats();
  }, [months]);

  useEffect(() => {
    if (isConnected) fetchRecentUploads();
  }, [months, isConnected]);

  const quotaPercent = quota ? Math.min(100, (quota.unitsUsed / quota.quotaLimit) * 100) : 0;
  const successRate = stats?.rates.successRate;
  const hasFailingRecordings = (stats?.topFailing.length ?? 0) > 0;

  const topFailingColumns = [
    { title: 'Recording', dataIndex: 'meeting', key: 'meeting', render: (t: string) => <Text strong>{t}</Text> },
    {
      title: 'Số lần lỗi',
      dataIndex: 'failureCount',
      key: 'failureCount',
      align: 'right' as const,
      render: (n: number, r: YoutubeStats['topFailing'][number]) => <Text>{n} / {r.attemptCount} lần sync</Text>,
    },
    {
      title: 'Trạng thái hiện tại',
      dataIndex: 'syncStatus',
      key: 'syncStatus',
      render: (s: string) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label || s}</Tag>,
    },
    {
      title: 'Lỗi gần nhất',
      dataIndex: 'syncError',
      key: 'syncError',
      ellipsis: true,
      render: (e: string | null) => e ? <Tooltip title={e}><Text type="secondary">{e}</Text></Tooltip> : <Text type="secondary">-</Text>,
    },
  ];

  const uploadColumns = [
    {
      title: 'Thumbnail',
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      render: (url: string) => url ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} /> : <div style={{ width: 100, height: 75, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Image</div>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'privacyStatus',
      key: 'privacyStatus',
      render: (s: string) => (
        <Tag color={s === 'public' ? 'green' : s === 'unlisted' ? 'blue' : 'orange'}>
          {(s || 'unknown').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Upload Date',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      render: (date: string) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: YoutubeVideo) => (
        <Space size="middle">
          <Button
            icon={<LinkOutlined />}
            size="small"
            href={`https://www.youtube.com/watch?v=${record.id}`}
            target="_blank"
          >
            View
          </Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => setEditingVideoId(record.id)}>
            Edit
          </Button>
        </Space>
      ),
    },
  ];

  const uploadDisabledReason = !isConnected
    ? 'Chưa kết nối YouTube'
    : !hasEnoughQuota
      ? 'Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai'
      : '';

  return (
    <DashboardLayout>
      {/* a. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Space size="middle" align="center" wrap>
          <YoutubePageTitle title="Dashboard" />
          <YoutubeConnectionBadge status={status} checking={checkingStatus} />
        </Space>
        <Tooltip title={uploadDisabledReason}>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setUploadOpen(true)}
            disabled={!!uploadDisabledReason}
          >
            Upload Video
          </Button>
        </Tooltip>
      </div>

      <YoutubeTokenBanner />

      {statsError && <Alert type="error" title={statsError} showIcon style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        {/* b. Stat cards */}
        <Col xs={24} sm={12} lg={6}>
          <Card loading={statsLoading && !stats} style={{ height: '100%' }}>
            <Statistic title="Video đã sync thành công" value={stats?.totals.completedVideos ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={statsLoading && !stats} style={{ height: '100%' }}>
            <Statistic
              title="Tỷ lệ thành công"
              value={successRate == null ? '-' : (successRate * 100).toFixed(1)}
              suffix={successRate == null ? undefined : '%'}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {stats ? `${stats.rates.completed} thành công · ${stats.rates.failed} thất bại` : ''}
              {stats?.rates.totalFailures ? ` · ${stats.rates.totalFailures}/${stats.rates.totalAttempts} lần sync bị lỗi` : ''}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={statsLoading && !stats} style={{ height: '100%' }}>
            <Statistic title="Tổng thời lượng đã upload" value={formatDuration(stats?.totals.totalDurationSeconds ?? 0)} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Dung lượng: {formatBytes(stats?.totals.totalBytes ?? 0)}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Quota hôm nay"
              value={quota ? quota.unitsUsed : '-'}
              suffix={quota ? `/ ${quota.quotaLimit.toLocaleString()} units` : undefined}
            />
            {quota && (
              <Progress
                percent={quotaPercent}
                strokeColor={getQuotaColor(quotaPercent)}
                showInfo={false}
                size="small"
                style={{ margin: '4px 0' }}
              />
            )}
            <Text type={hasEnoughQuota ? 'secondary' : 'danger'} style={{ fontSize: 12, display: 'block' }}>
              {quota
                ? hasEnoughQuota
                  ? `Còn ~${quota.estimatedUploadsRemaining} lượt upload`
                  : 'Hết quota — không đủ cho 1 lượt upload'
                : isConnected ? 'Không lấy được thông tin quota' : 'Chưa kết nối YouTube'}
            </Text>
            {!!stats?.quota.daysSampled && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Trung bình {stats.quota.averageUnitsPerDay.toLocaleString()} units/ngày ({stats.quota.daysSampled} ngày gần nhất)
              </Text>
            )}
          </Card>
        </Col>

        {/* c. Time filter: applies to the chart and Recent Uploads */}
        <Col span={24}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={statsLoading || loadingUploads}>Refresh</Button>
          </div>
        </Col>

        {/* d. Monthly chart */}
        <Col span={24}>
          <MonthlyBarChart
            title="Video sync thành công theo tháng"
            valueLabel="Video sync thành công"
            loading={statsLoading}
            data={(stats?.monthly || []).map(m => ({ month: m.month, value: m.completed }))}
            note={
              <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                <InfoCircleOutlined /> Tính trên các lần sync Zoom → YouTube; video upload thủ công không được tính.
              </Text>
            }
          />
        </Col>

        {/* e. Failing recordings: hidden entirely when there are none */}
        {hasFailingRecordings && (
          <Col span={24}>
            <Card
              title="Recording hay lỗi nhất"
              extra={<Link href="/youtube/channel-content?tab=zoom-sync">Xem tại Zoom Sync</Link>}
            >
              <Table
                size="small"
                rowKey="recordingId"
                pagination={false}
                dataSource={stats?.topFailing || []}
                columns={topFailingColumns}
              />
            </Card>
          </Col>
        )}

        {/* f. Recent uploads */}
        <Col span={24}>
          <Card title="Recent Uploads">
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              <InfoCircleOutlined /> Lấy trực tiếp từ kênh YouTube đang kết nối, nên gồm mọi video trên kênh trong khoảng thời gian đã chọn:
              video upload thủ công tại đây, video sync từ Zoom và cả video đăng trực tiếp trên YouTube Studio.
            </Text>
            <Table
              columns={uploadColumns}
              dataSource={recentUploads}
              rowKey="id"
              loading={loadingUploads}
              locale={{ emptyText: isConnected ? 'No videos found' : 'Connect to YouTube to see recent uploads' }}
            />
          </Card>
        </Col>
      </Row>

      <UploadVideoModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        hasEnoughQuota={hasEnoughQuota}
        onUploaded={() => {
          fetchRecentUploads();
          fetchQuota();
        }}
      />

      <EditVideoModal
        videoId={editingVideoId}
        open={!!editingVideoId}
        onClose={() => setEditingVideoId(null)}
        onSaved={(video) => {
          setRecentUploads(prev => prev.map(v => v.id === video.id
            ? { ...v, title: video.title, description: video.description, privacyStatus: video.privacyStatus, thumbnail: video.thumbnail || v.thumbnail }
            : v));
          fetchQuota();
        }}
      />
    </DashboardLayout>
  );
}
