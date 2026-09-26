'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { CalendarOutlined, FilterOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { useFormat, useT } from '@/lib/i18n';

const { Text } = Typography;

interface UpcomingMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
  recurring: boolean;
  rule: { id: string; matchText: string } | null;
  autoUpload: boolean;
  title: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  playlistId: string | null;
  publishDelayMinutes: number | null;
  publishAt: string | null;
}

interface UpcomingResponse {
  days: number;
  configured: boolean;
  missingScope: boolean;
  meetings: UpcomingMeeting[];
}

// Upcoming Zoom meetings and what the sync will do with each recording
// (P2-4a): rule, YouTube title, playlist, privacy, scheduled publication.
// `refreshKey` changes when the settings or rules are saved: the predictions
// are worked out again (Zoom's list itself is cached by the backend).
export default function ZoomUpcomingMeetings({
  playlists,
  refreshKey,
  onOpenRule,
}: {
  playlists: { id: string; title: string }[];
  refreshKey: number;
  onOpenRule: (ruleId: string) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const [data, setData] = useState<UpcomingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async (refresh = false) => {
    setLoading(true);
    setError(false);
    try {
      setData(await apiFetch(`/zoom/meetings/upcoming${refresh ? '?refresh=1' : ''}`));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  // Without a Zoom connection the page already explains what to do
  if (data && !data.configured) return null;

  const days = data?.days ?? 14;
  const playlistTitle = (id: string) => playlists.find(p => p.id === id)?.title || id;
  const dayAndTime = (value: string) =>
    new Date(value).toLocaleString(fmt.locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const renderMeeting = (meeting: UpcomingMeeting, index: number) => (
    <li
      key={`${meeting.meetingId}@${meeting.startTime}`}
      style={{ padding: '12px 0', borderTop: index > 0 ? '1px solid var(--color-divider)' : undefined }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', width: '100%' }}>
        <div style={{ minWidth: 150 }}>
          <Text strong>{dayAndTime(meeting.startTime)}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('zoomDash.minutes', { count: meeting.durationMinutes })}
            {meeting.recurring && <> · <SyncOutlined /> {t('upcoming.recurring')}</>}
          </Text>
        </div>
        <Space orientation="vertical" size={4} style={{ flex: '1 1 280px', minWidth: 0 }}>
          <Text strong style={{ overflowWrap: 'anywhere' }}>{meeting.topic}</Text>
          <Space size={[4, 4]} wrap>
            {meeting.rule ? (
              <Tooltip title={t('upcoming.editRule')}>
                <Tag
                  color="processing"
                  icon={<FilterOutlined />}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onOpenRule(meeting.rule!.id)}
                >
                  {meeting.rule.matchText}
                </Tag>
              </Tooltip>
            ) : (
              <Tag>{t('upcoming.defaultRule')}</Tag>
            )}
            {!meeting.autoUpload ? (
              <Text type="secondary">{t('upcoming.autoUploadOff')}</Text>
            ) : (
              <>
                {meeting.playlistId && <Tag>{playlistTitle(meeting.playlistId)}</Tag>}
                <Tag>{t(`privacy.${meeting.privacyStatus}` as 'privacy.private')}</Tag>
                {meeting.publishAt && (
                  <Tag color="gold">{t('upcoming.publishAt', { time: fmt.dateTime(meeting.publishAt) })}</Tag>
                )}
              </>
            )}
          </Space>
          {meeting.autoUpload && (
            <Text type="secondary" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
              {t('upcoming.youtubeTitle', { title: meeting.title })}
            </Text>
          )}
        </Space>
      </div>
    </li>
  );

  return (
    <Card
      title={<Space><CalendarOutlined /><span>{t('upcoming.title')}</span></Space>}
      extra={
        // Icon only: the title keeps its room on a phone
        <Tooltip title={t('common.refresh')}>
          <Button icon={<ReloadOutlined />} aria-label={t('common.refresh')} onClick={() => load(true)} loading={loading} />
        </Tooltip>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {t('upcoming.subtitle', { days })}
      </Text>
      {error ? (
        <Alert type="error" showIcon title={t('upcoming.loadFailed')} />
      ) : data?.missingScope ? (
        <Alert type="info" showIcon title={t('upcoming.missingScopeTitle')} description={t('upcoming.missingScopeDesc')} />
      ) : (
        <Spin spinning={loading && !data}>
          {data && data.meetings.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('upcoming.empty', { days })} />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, minHeight: data ? undefined : 80 }}>
              {(data?.meetings ?? []).map(renderMeeting)}
            </ul>
          )}
        </Spin>
      )}
    </Card>
  );
}
