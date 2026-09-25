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
import { useFormat, useSyncErrorText, useT, type MessageKey } from '@/lib/i18n';

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
    errorCode: string | null;
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

const STATUS_TAG: Record<string, { color: string; label: MessageKey }> = {
  COMPLETED: { color: 'success', label: 'zoomRec.ready' },
  FAILED: { color: 'error', label: 'sync.status.failed' },
  UPLOADING: { color: 'blue', label: 'zoomRec.uploading' },
  PROCESSING: { color: 'warning', label: 'zoomRec.processing' },
  PENDING: { color: 'default', label: 'status.pending' },
};

export default function YoutubeDashboardPage() {
  const t = useT();
  const syncErrorText = useSyncErrorText();
  const fmt = useFormat();
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
      setStatsError(e.message || t('ytDash.statsLoadFailed'));
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
      message.error(t('ytDash.uploadsLoadFailed'));
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
    { title: t('ytDash.colRecording'), dataIndex: 'meeting', key: 'meeting', render: (meeting: string) => <Text strong>{meeting}</Text> },
    {
      title: t('ytDash.colFailures'),
      dataIndex: 'failureCount',
      key: 'failureCount',
      align: 'right' as const,
      render: (n: number, r: YoutubeStats['topFailing'][number]) => <Text>{t('ytDash.failuresValue', { failures: n, attempts: r.attemptCount })}</Text>,
    },
    {
      title: t('ytDash.colCurrentStatus'),
      dataIndex: 'syncStatus',
      key: 'syncStatus',
      render: (s: string) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s] ? t(STATUS_TAG[s].label) : s}</Tag>,
    },
    {
      title: t('ytDash.colLastError'),
      dataIndex: 'syncError',
      key: 'syncError',
      ellipsis: true,
      render: (e: string | null, row: { errorCode: string | null }) => {
        if (!e) return <Text type="secondary">-</Text>;
        const text = syncErrorText(row.errorCode, e);
        return <Tooltip title={text}><Text type="secondary">{text}</Text></Tooltip>;
      },
    },
  ];

  const uploadColumns = [
    {
      title: t('col.thumbnail'),
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      render: (url: string) => url ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} /> : <div style={{ width: 100, height: 75, background: 'var(--color-divider)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('common.noImage')}</div>,
    },
    {
      title: t('col.title'),
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('ytDash.colStatus'),
      dataIndex: 'privacyStatus',
      key: 'privacyStatus',
      render: (s: string) => (
        <Tag color={s === 'public' ? 'green' : s === 'unlisted' ? 'blue' : 'orange'}>
          {s ? t(`privacy.${s}` as MessageKey) : t('common.unknown')}
        </Tag>
      ),
    },
    {
      title: t('ytDash.colUploadDate'),
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      render: (date: string) => date ? fmt.dateTime(date) : '-',
    },
    {
      title: t('col.actions'),
      key: 'action',
      render: (_: any, record: YoutubeVideo) => (
        <Space size="middle">
          <Button
            icon={<LinkOutlined />}
            size="small"
            href={`https://www.youtube.com/watch?v=${record.id}`}
            target="_blank"
          >
            {t('common.view')}
          </Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => setEditingVideoId(record.id)}>
            {t('common.edit')}
          </Button>
        </Space>
      ),
    },
  ];

  const uploadDisabledReason = !isConnected
    ? t('ytDash.notConnected')
    : !hasEnoughQuota
      ? t('quota.exhausted')
      : '';

  return (
    <DashboardLayout>
      {/* a. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Space size="middle" align="center" wrap>
          <YoutubePageTitle title={t('nav.dashboard')} />
          <YoutubeConnectionBadge status={status} checking={checkingStatus} />
        </Space>
        <Tooltip title={uploadDisabledReason}>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setUploadOpen(true)}
            disabled={!!uploadDisabledReason}
          >
            {t('ytDash.uploadVideo')}
          </Button>
        </Tooltip>
      </div>

      <YoutubeTokenBanner />

      {statsError && <Alert type="error" title={statsError} showIcon style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        {/* b. Stat cards */}
        <Col xs={24} sm={12} lg={6}>
          <Card loading={statsLoading && !stats} style={{ height: '100%' }}>
            <Statistic title={t('ytDash.statSynced')} value={stats?.totals.completedVideos ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={statsLoading && !stats} style={{ height: '100%' }}>
            <Statistic
              title={t('ytDash.statSuccessRate')}
              value={successRate == null ? '-' : (successRate * 100).toFixed(1)}
              suffix={successRate == null ? undefined : '%'}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {stats ? t('ytDash.successFailed', { completed: stats.rates.completed, failed: stats.rates.failed }) : ''}
              {stats?.rates.totalFailures ? t('ytDash.attemptsFailed', { failures: stats.rates.totalFailures, attempts: stats.rates.totalAttempts }) : ''}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={statsLoading && !stats} style={{ height: '100%' }}>
            <Statistic title={t('ytDash.statDuration')} value={formatDuration(stats?.totals.totalDurationSeconds ?? 0)} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('ytDash.storage', { size: formatBytes(stats?.totals.totalBytes ?? 0) })}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title={t('ytDash.statQuota')}
              value={quota ? quota.unitsUsed : '-'}
              suffix={quota ? t('ytDash.quotaSuffix', { limit: fmt.number(quota.quotaLimit) }) : undefined}
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
                  ? t('ytDash.uploadsLeft', { n: quota.estimatedUploadsRemaining })
                  : t('ytDash.quotaNoUpload')
                : isConnected ? t('ytDash.quotaUnavailable') : t('ytDash.notConnected')}
            </Text>
            {!!stats?.quota.daysSampled && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                {t('ytDash.quotaAverage', { units: fmt.number(stats.quota.averageUnitsPerDay), days: stats.quota.daysSampled })}
              </Text>
            )}
          </Card>
        </Col>

        {/* c. Time filter: applies to the chart and Recent Uploads */}
        <Col span={24}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text type="secondary">{t('range.label')}</Text>
            <Select
              value={months}
              onChange={setMonths}
              style={{ width: 200 }}
              options={[
                { value: 3, label: t('range.months', { n: 3 }) },
                { value: 6, label: t('range.months', { n: 6 }) },
                { value: 12, label: t('range.months', { n: 12 }) },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={statsLoading || loadingUploads}>{t('common.refresh')}</Button>
          </div>
        </Col>

        {/* d. Monthly chart */}
        <Col span={24}>
          <MonthlyBarChart
            title={t('ytDash.chartTitle')}
            valueLabel={t('ytDash.chartValue')}
            loading={statsLoading}
            data={(stats?.monthly || []).map(m => ({ month: m.month, value: m.completed }))}
            note={
              <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                <InfoCircleOutlined /> {t('ytDash.chartNote')}
              </Text>
            }
          />
        </Col>

        {/* e. Failing recordings: hidden entirely when there are none */}
        {hasFailingRecordings && (
          <Col span={24}>
            <Card
              title={t('ytDash.failingTitle')}
              extra={<Link href="/youtube/channel-content?tab=zoom-sync">{t('ytDash.viewInZoomSync')}</Link>}
            >
              <Table
                scroll={{ x: 'max-content' }}
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
          <Card title={t('ytDash.recentUploads')}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              <InfoCircleOutlined /> {t('ytDash.recentNote')}
            </Text>
            <Table
              scroll={{ x: 'max-content' }}
              columns={uploadColumns}
              dataSource={recentUploads}
              rowKey="id"
              loading={loadingUploads}
              locale={{ emptyText: isConnected ? t('ytDash.noVideos') : t('ytDash.connectToSee') }}
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
