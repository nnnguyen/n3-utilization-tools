'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Select, Segmented, Space, Spin, Alert, Button, Tooltip as AntTooltip } from 'antd';
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardLayout from '../../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';

const { Title, Text } = Typography;

// Single series, so one hue (antd primary) and no legend: the card title names it
const BAR_COLOR = '#1677ff';
const GRID_COLOR = '#f0f0f0';
const AXIS_TEXT_COLOR = 'rgba(0, 0, 0, 0.45)';

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

// "2026-09" -> "09/2026"
const formatMonth = (month: string) => {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
};

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  COMPLETED: { color: 'success', label: 'Ready' },
  FAILED: { color: 'error', label: 'Failed' },
  UPLOADING: { color: 'blue', label: 'Uploading' },
  PROCESSING: { color: 'warning', label: 'Processing' },
  PENDING: { color: 'default', label: 'Pending' },
};

function MonthlyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px', boxShadow: '0 3px 6px rgba(0,0,0,0.08)' }}>
      <div style={{ color: AXIS_TEXT_COLOR, fontSize: 12 }}>{formatMonth(label)}</div>
      <div style={{ fontWeight: 600 }}>{payload[0].value} video</div>
    </div>
  );
}

export default function YoutubeDashboard() {
  const [stats, setStats] = useState<YoutubeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/youtube/stats?months=${months}`);
      setStats(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [months]);

  const successRate = stats?.rates.successRate;
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
      render: (e: string | null) => e ? <AntTooltip title={e}><Text type="secondary">{e}</Text></AntTooltip> : <Text type="secondary">-</Text>,
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>YouTube Dashboard</Title>
        <Space>
          <Select
            value={months}
            onChange={setMonths}
            style={{ width: 150 }}
            options={[
              { value: 3, label: '3 tháng gần nhất' },
              { value: 6, label: '6 tháng gần nhất' },
              { value: 12, label: '12 tháng gần nhất' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading}>Refresh</Button>
        </Space>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        <InfoCircleOutlined /> Số liệu tính trên các lần sync Zoom → YouTube; video upload thủ công không được tính.
      </Text>

      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Spin spinning={loading && !stats}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Video đã sync thành công" value={stats?.totals.completedVideos ?? 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
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
            <Card>
              <Statistic title="Tổng thời lượng đã upload" value={formatDuration(stats?.totals.totalDurationSeconds ?? 0)} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Dung lượng: {formatBytes(stats?.totals.totalBytes ?? 0)}
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Quota trung bình / ngày" value={stats?.quota.averageUnitsPerDay ?? 0} suffix="units" />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {stats?.quota.daysSampled ? `Tính trên ${stats.quota.daysSampled} ngày có dữ liệu gần nhất` : 'Chưa có dữ liệu'}
              </Text>
            </Card>
          </Col>

          <Col span={24}>
            <Card
              title="Video sync thành công theo tháng"
              extra={
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => setView(v as 'chart' | 'table')}
                  options={[{ value: 'chart', label: 'Biểu đồ' }, { value: 'table', label: 'Bảng' }]}
                />
              }
            >
              {view === 'chart' ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={stats?.monthly || []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonth}
                        tick={{ fill: AXIS_TEXT_COLOR, fontSize: 12 }}
                        axisLine={{ stroke: GRID_COLOR }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: AXIS_TEXT_COLOR, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
                      <Bar dataKey="completed" name="Video" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="month"
                  dataSource={stats?.monthly || []}
                  columns={[
                    { title: 'Tháng', dataIndex: 'month', key: 'month', render: formatMonth },
                    { title: 'Video sync thành công', dataIndex: 'completed', key: 'completed', align: 'right' as const },
                  ]}
                />
              )}
            </Card>
          </Col>

          <Col span={24}>
            <Card title="Recording hay lỗi nhất">
              <Table
                size="small"
                rowKey="recordingId"
                pagination={false}
                dataSource={stats?.topFailing || []}
                columns={topFailingColumns}
                locale={{ emptyText: 'Chưa có recording nào bị lỗi' }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </DashboardLayout>
  );
}
