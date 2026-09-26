'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Form, Input, Select, Table, Space, Alert, message, Spin, Divider, DatePicker, Modal, Descriptions, Progress, Tooltip, Popconfirm } from 'antd';
import { VideoCameraOutlined, HistoryOutlined, YoutubeOutlined, ReloadOutlined, FilePdfOutlined, AudioOutlined, MessageOutlined, PlayCircleOutlined, EditOutlined, LinkOutlined, DisconnectOutlined, FileTextOutlined } from '@ant-design/icons';
import EditVideoModal from './EditVideoModal';
import SyncHistoryModal from './SyncHistoryModal';
import { apiFetch } from '@/lib/api';
import { useFormat, useSyncErrorText, useT } from '@/lib/i18n';
import { CAPTION_STATUS_COLORS, hasTranscript, isCaptionStatus, type CaptionStatus } from '@/lib/captions';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// 3725 -> "1:02:05", 185 -> "3:05"
function formatSeconds(total?: number | null) {
  if (total == null) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Zoom Recordings table with its sync flow (moved as-is from the Zoom
// Utilities page into YouTube → Channel Content → Zoom Sync)
export default function ZoomRecordingsPanel({
  onPlaylistsLoaded,
}: {
  // Lets the Zoom page reuse the playlists without fetching them again
  onPlaylistsLoaded?: (playlists: any[]) => void;
} = {}) {
  const t = useT();
  const syncErrorText = useSyncErrorText();
  const fmt = useFormat();
  const [recordings, setRecordings] = useState([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });
  
  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState<string>('30');
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Details Modal
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<any>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  // Sync Confirmation Modal
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncingRecord, setSyncingRecord] = useState<any>(null);
  const [syncPrivacyStatus, setSyncPrivacyStatus] = useState('private');
  const [syncPlaylistId, setSyncPlaylistId] = useState('none');
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [workflowDefaults, setWorkflowDefaults] = useState({ privacyStatus: 'private', playlistId: 'none' });

  // History Modal
  const [historyRecording, setHistoryRecording] = useState<any>(null);

  // Linking a recording to a video already on YouTube (suggested, or picked by hand)
  const [linkingIds, setLinkingIds] = useState<Set<string>>(new Set());
  const [pickerRecord, setPickerRecord] = useState<any>(null);
  const [channelVideos, setChannelVideos] = useState<any[]>([]);
  const [channelVideosLoading, setChannelVideosLoading] = useState(false);
  const [pickedVideoId, setPickedVideoId] = useState<string | undefined>(undefined);

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  // Recordings whose captions are being uploaded by hand
  const [captionIds, setCaptionIds] = useState<Set<string>>(new Set());
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const [quota, setQuota] = useState<any>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<any>(null);

  // Polling for processing logs and sync status
  useEffect(() => {
    const activePolling = logs.some((log: any) => 
      log.syncStatus === 'UPLOADING' || 
      log.syncStatus === 'PROCESSING' ||
      // An automatic retry is scheduled: keep polling so the UI sees it start
      (log.syncStatus === 'FAILED' && log.nextRetryAt)
    );
    
    if (activePolling) {
      const interval = setInterval(() => {
        fetchLogs();
        // Also refresh status for specific recordings
        logs.forEach((log: any) => {
          if (log.syncStatus === 'PROCESSING') {
            refreshStatus(log.recordingId);
          }
        });
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [logs]);

  // SyncHistoryModal loads the logs itself
  const fetchHistory = (record: any) => {
    setHistoryRecording(record);
  };

  const refreshStatus = async (recordingId: string) => {
    try {
      await apiFetch(`/youtube/recordings/${recordingId}/refresh-status`, {
        method: 'POST'
      });
      // fetchLogs will be called by the interval or manually
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  };

  const fetchConfigs = async () => {
    setConfigsLoading(true);
    try {
      const response = await apiFetch('/integrations/config');
      setConfigs(response);
    } catch (error: any) {
      message.error(t('zoomRec.configLoadFailed'));
    } finally {
      setConfigsLoading(false);
    }
  };

  // The backend returns every recording in the range (it splits ranges over a
  // month into several Zoom queries), so the table paginates on the client
  const fetchRecordings = async () => {
    let from: string;
    let to: string;
    if (dateFilter !== 'custom') {
      const days = parseInt(dateFilter);
      from = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
      to = dayjs().format('YYYY-MM-DD');
    } else if (customDateRange) {
      from = customDateRange[0].format('YYYY-MM-DD');
      to = customDateRange[1].format('YYYY-MM-DD');
    } else {
      // "Custom Range" picked but no dates yet: keep the current list (an
      // empty range would make Zoom return only today's recordings)
      return;
    }

    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ from, to });
      const response = await apiFetch(`/zoom/recordings?${queryParams.toString()}`);
      setRecordings(response.meetings || []);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error fetching recordings:', error);
      message.error(error.message || t('zoomRec.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await apiFetch('/zoom/logs');
      setLogs(response);
    } catch (error: any) {
      console.error('Error fetching sync logs:', error);
    } finally {
      setLogsLoading(false);
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

  const fetchYoutubeStatus = async () => {
    try {
      const data = await apiFetch('/youtube/status');
      setYoutubeStatus(data);
      if (data.connected) {
        fetchPlaylists();
      }
    } catch (error) {
      console.error('Failed to fetch YouTube status', error);
    }
  };

  // Defaults of the sync dialog come from the Automation Workflow settings
  const fetchWorkflowDefaults = async () => {
    try {
      const settings = await apiFetch('/zoom/workflow-settings');
      setWorkflowDefaults({ privacyStatus: settings.privacyStatus, playlistId: settings.playlistId || 'none' });
      return settings;
    } catch (error) {
      console.error('Failed to fetch workflow settings', error);
      return null;
    }
  };

  const openSyncDialog = async (record: any) => {
    setSyncingRecord(record);
    setSyncPrivacyStatus(workflowDefaults.privacyStatus);
    setSyncPlaylistId(workflowDefaults.playlistId);
    setSyncModalVisible(true);
    // Settings may have changed on the Zoom page since the panel loaded
    const settings = await fetchWorkflowDefaults();
    if (settings) {
      setSyncPrivacyStatus(settings.privacyStatus);
      setSyncPlaylistId(settings.playlistId || 'none');
    }
  };

  const fetchPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const data = await apiFetch('/youtube/playlists');
      setPlaylists(data);
      onPlaylistsLoaded?.(data);
    } catch (error) {
      console.error('Failed to fetch playlists', error);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const fetchAllData = async () => {
    await Promise.all([
      fetchRecordings(),
      fetchLogs(),
      fetchQuota(),
      fetchYoutubeStatus()
    ]);
  };

  useEffect(() => {
    const init = async () => {
      await fetchConfigs();
      await fetchAllData();
    };
    init();
  }, [dateFilter, customDateRange]);

  const withLinking = async (recordingId: string, action: () => Promise<void>) => {
    setLinkingIds(prev => new Set(prev).add(recordingId));
    try {
      await action();
    } catch (error: any) {
      message.error(t('zoomRec.actionFailed', { error: error.message || '' }));
    } finally {
      setLinkingIds(prev => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  };

  // The recording counts as synced from now on (a COMPLETED record pointing at the video)
  const linkRecording = (record: any, videoId: string, source: 'suggestion' | 'picker') =>
    withLinking(record.uuid || record.id, async () => {
      await apiFetch('/zoom/recordings/link', {
        method: 'POST',
        body: JSON.stringify({
          recordingId: record.uuid || record.id,
          videoId,
          topic: record.topic,
          startTime: record.start_time,
          source,
        }),
      });
      message.success(t('zoomRec.linkSuccess'));
      setPickerRecord(null);
      await fetchAllData();
    });

  const unlinkRecording = (record: any) =>
    withLinking(record.uuid || record.id, async () => {
      await apiFetch('/zoom/recordings/unlink', {
        method: 'POST',
        body: JSON.stringify({ recordingId: record.uuid || record.id }),
      });
      message.success(t('zoomRec.unlinkSuccess'));
      await fetchAllData();
    });

  // "Upload captions": the Zoom transcript becomes captions of the synced video
  const uploadCaptions = async (recordingId: string) => {
    setCaptionIds(prev => new Set(prev).add(recordingId));
    try {
      const result = await apiFetch(`/zoom/recordings/${encodeURIComponent(recordingId)}/captions`, { method: 'POST' });
      if (result.captionStatus === 'uploaded') message.success(t('caption.uploaded'));
      else if (result.captionStatus === 'waiting_transcript') message.info(t('caption.stillWaiting'));
      else message.error(t('caption.failed', { reason: syncErrorText(result.captionErrorCode, result.captionError || '') }));
      // Only this log changes
      setLogs(prev => prev.map(l => (l.recordingId === recordingId ? { ...l, ...result } : l)));
    } catch (error: any) {
      message.error(t('caption.failed', { reason: error.message || '' }));
    } finally {
      setCaptionIds(prev => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  };

  // Caption state of a synced video, with the reason on hover
  const captionTag = (log: any) => {
    if (!isCaptionStatus(log?.captionStatus)) return null;
    const status: CaptionStatus = log.captionStatus;
    const tooltip =
      status === 'failed' ? syncErrorText(log.captionErrorCode, log.captionError || t('zoomRec.unknownError'))
      : status === 'waiting_transcript' ? t('caption.waitingHelp')
      : status === 'no_transcript' ? t('caption.noTranscriptHelp')
      : null;
    const tag = (
      <Tag color={CAPTION_STATUS_COLORS[status]} icon={<FileTextOutlined />} style={tooltip ? { cursor: 'help' } : undefined}>
        {t(`caption.status.${status}` as 'caption.status.uploaded')}
      </Tag>
    );
    return tooltip ? <Tooltip title={tooltip}>{tag}</Tooltip> : tag;
  };

  const dismissMatch = (record: any) =>
    withLinking(record.uuid || record.id, async () => {
      await apiFetch('/zoom/recordings/dismiss-match', {
        method: 'POST',
        body: JSON.stringify({ recordingId: record.uuid || record.id, videoId: record.youtubeMatch.videoId }),
      });
      message.success(t('zoomRec.dismissed'));
      // Only this row changes: drop its suggestion without reloading the list
      setRecordings((prev: any) =>
        prev.map((r: any) => (r === record ? { ...r, youtubeMatch: undefined } : r)),
      );
    });

  const openLinkPicker = async (record: any) => {
    setPickerRecord(record);
    setPickedVideoId(record.youtubeMatch?.videoId);
    setChannelVideosLoading(true);
    try {
      const data = await apiFetch('/youtube/channel/videos');
      setChannelVideos(data.videos || []);
    } catch {
      setChannelVideos([]);
    } finally {
      setChannelVideosLoading(false);
    }
  };

  const handleManualSync = async (record: any, privacyStatus: string = 'private', playlistId?: string) => {
    if (quota && quota.unitsRemaining < 1650) {
      message.error(t('quota.exhausted'));
      return;
    }
    const recordingId = record.uuid || record.id;
    setSyncingIds(prev => new Set(prev).add(recordingId));
    try {
      let finalPlaylistId = playlistId === 'none' ? undefined : playlistId;
      
      if (playlistId === 'create_new') {
        if (!newPlaylistTitle) {
          message.error(t('playlistPicker.newTitleRequired'));
          setSyncingIds(prev => {
            const next = new Set(prev);
            next.delete(recordingId);
            return next;
          });
          return;
        }
        const newPlaylist = await apiFetch('/youtube/playlists', {
          method: 'POST',
          body: JSON.stringify({
            title: newPlaylistTitle,
            privacyStatus: privacyStatus
          })
        });
        finalPlaylistId = newPlaylist.id;
        message.success(t('playlistPicker.created', { title: newPlaylistTitle }));
        fetchPlaylists();
      }

      await apiFetch('/zoom/sync', {
        method: 'POST',
        body: JSON.stringify({
          recordingId: recordingId,
          topic: record.topic,
          startTime: record.start_time,
          privacyStatus: privacyStatus,
          playlistId: finalPlaylistId
        })
      });
      message.success(t('zoomRec.syncStarted', { topic: record.topic, privacy: t(`privacy.${privacyStatus}` as 'privacy.public') }));
      // Immediately fetch logs and recordings to show "Processing" state
      await fetchAllData();
    } catch (error: any) {
      console.error('Manual sync failed:', error);
      message.error(error.message || t('zoomRec.syncFailed', { topic: record.topic }));
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  };

  const recordingColumns = [
    {
      title: t('zoomRec.colTopic'),
      dataIndex: 'topic',
      key: 'topic',
      sorter: (a: any, b: any) => a.topic.localeCompare(b.topic),
    },
    {
      title: t('zoomRec.colStartTime'),
      dataIndex: 'start_time',
      key: 'start_time',
      render: (text: string) => fmt.dateTime(text),
      sorter: (a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: t('zoomRec.colDuration'),
      dataIndex: 'duration',
      key: 'duration',
      sorter: (a: any, b: any) => a.duration - b.duration,
    },
    {
      title: t('zoomRec.colFile'),
      dataIndex: 'recording_files',
      key: 'files',
      render: (files: any[]) => {
        const file = files.find(f => f.recording_type === 'shared_screen_with_speaker_view');
        if (!file) return <Text type="secondary">N/A</Text>;
        return (
          <Button 
            type="link" 
            href={file.download_url} 
            target="_blank" 
            style={{ padding: 0 }}
          >
            {t('zoomRec.downloadLink')}
          </Button>
        );
      },
    },
    {
      title: t('zoomRec.colStatus'),
      key: 'syncStatus',
      render: (record: any) => {
        const recordingId = record.uuid || record.id;
        const log = logs.find((l: any) => l.recordingId === recordingId);
        
        const match = record.youtubeMatch;
        if ((!log || log.syncStatus === 'PENDING') && match) {
          return (
            <Space orientation="vertical" size={2} style={{ maxWidth: 260 }}>
              <Tag color={match.exact ? 'success' : 'gold'} icon={<LinkOutlined />}>
                {match.exact ? t('zoomRec.foundOnYouTube') : t('zoomRec.maybeOnYouTube')}
              </Tag>
              <a href={`https://www.youtube.com/watch?v=${match.videoId}`} target="_blank" rel="noreferrer">
                <Text ellipsis style={{ maxWidth: 260, color: 'inherit' }}>{match.title}</Text>
              </a>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[formatSeconds(match.durationSeconds), match.publishedAt ? fmt.date(match.publishedAt) : null].filter(Boolean).join(' · ')}
              </Text>
            </Space>
          );
        }
        if (!log) return <Tag color="default">{t('zoomRec.notSynced')}</Tag>;
        if (log.source === 'linked') {
          return (
            <Space orientation="vertical" size={4}>
              <Tag color="success" icon={<LinkOutlined />}>{t('zoomRec.linked')}</Tag>
              {captionTag(log)}
            </Space>
          );
        }

        const status = log.syncStatus || 'PENDING';
        
        switch (status) {
          case 'UPLOADING':
            return (
              <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                <Tag color="blue"><Spin size="small" style={{ marginRight: 8 }} />{t('zoomRec.uploading')}</Tag>
                {log.progress > 0 && <Progress percent={log.progress} size="small" status="active" />}
              </Space>
            );
          case 'PROCESSING':
            const duration = log.syncStartedAt ? Math.floor((new Date().getTime() - new Date(log.syncStartedAt).getTime()) / 60000) : 0;
            return <Tag color="warning">{t('zoomRec.processing')} {duration > 0 ? `(${duration}m)` : ''}</Tag>;
          case 'COMPLETED':
            return (
              <Space orientation="vertical" size={4}>
                <Tag color="success">{t('zoomRec.ready')}</Tag>
                {captionTag(log)}
              </Space>
            );
          case 'FAILED':
            return (
              <Space orientation="vertical" size={0}>
                <Tooltip title={log.syncError ? syncErrorText(log.errorCode, log.syncError) : t('zoomRec.unknownError')}>
                  <Tag color="error" style={{ cursor: 'pointer' }}>{t('sync.status.failed')}</Tag>
                </Tooltip>
                {log.nextRetryAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('zoomRec.retryAt', { time: dayjs(log.nextRetryAt).format('HH:mm'), attempt: log.autoRetryCount + 1 })}
                  </Text>
                )}
              </Space>
            );
          case 'PENDING':
          default:
            return <Tag color="default">{t('zoomRec.notSynced')}</Tag>;
        }
      }
    },
    {
      title: 'YouTube',
      key: 'youtube',
      render: (record: any) => {
        const recordingId = record.uuid || record.id;
        const log = logs.find((l: any) => l.recordingId === recordingId);
        
        if (log && log.syncStatus === 'COMPLETED' && log.youtubeVideoId) {
          return (
            <Button 
              type="link" 
              size="small" 
              href={`https://www.youtube.com/watch?v=${log.youtubeVideoId}`} 
              target="_blank"
              icon={<YoutubeOutlined />}
            >
              {t('zoomRec.watchOnYouTube')}
            </Button>
          );
        }
        return '—';
      }
    },
    {
      title: t('zoomRec.colAction'),
      key: 'action',
      render: (record: any) => {
        const recordingId = record.uuid || record.id;
        const log = logs.find((l: any) => l.recordingId === recordingId);
        
        const isSyncing = syncingIds.has(recordingId) || (log && (log.syncStatus === 'UPLOADING' || log.syncStatus === 'PROCESSING'));
        const isCompleted = log && log.syncStatus === 'COMPLETED';
        const isFailed = log && log.syncStatus === 'FAILED';
        const hasHistory = log && log.syncStatus !== 'PENDING' && log.source !== 'linked';
        const isLinked = log?.source === 'linked';
        const match = !log || log.syncStatus === 'PENDING' ? record.youtubeMatch : null;
        const busy = linkingIds.has(recordingId);
        // Captions can go on any video already on YouTube whose recording has a transcript
        const canUploadCaptions = isCompleted && !!log.youtubeVideoId && hasTranscript(record.recording_files);

        return (
          <Space wrap>
            {match && (
              <>
                <Popconfirm
                  title={t('zoomRec.linkConfirm', { title: match.title })}
                  onConfirm={() => linkRecording(record, match.videoId, 'suggestion')}
                  okText={t('zoomRec.link')}
                  cancelText={t('common.cancel')}
                >
                  <Button type="primary" size="small" icon={<LinkOutlined />} loading={busy}>
                    {t('zoomRec.link')}
                  </Button>
                </Popconfirm>
                <Button size="small" onClick={() => dismissMatch(record)} disabled={busy}>
                  {t('zoomRec.notThis')}
                </Button>
              </>
            )}
            {isLinked && (
              <Popconfirm
                title={t('zoomRec.unlinkConfirm')}
                onConfirm={() => unlinkRecording(record)}
                okText={t('zoomRec.unlink')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" icon={<DisconnectOutlined />} loading={busy}>
                  {t('zoomRec.unlink')}
                </Button>
              </Popconfirm>
            )}
            <Button 
              type="default" 
              size="small"
              onClick={() => {
                setSelectedRecording(record);
                setDetailsVisible(true);
              }}
            >
              {t('zoomRec.details')}
            </Button>
            
            {!isCompleted && (
              <Button 
                icon={<YoutubeOutlined />} 
                size="small"
                onClick={() => openSyncDialog(record)}
                loading={syncingIds.has(recordingId)}
                disabled={isSyncing && !isFailed}
                danger={isFailed}
                type={isFailed ? 'primary' : 'default'}
              >
                {isFailed ? t('zoomRec.resync') : isSyncing ? t('zoomRec.processingEllipsis') : t('zoomRec.sync')}
              </Button>
            )}

            {!isCompleted && !isSyncing && (
              <Tooltip title={t('zoomRec.linkExisting')}>
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  aria-label={t('zoomRec.linkExisting')}
                  onClick={() => openLinkPicker(record)}
                  disabled={busy}
                />
              </Tooltip>
            )}

            {canUploadCaptions && (
              <Popconfirm
                title={t('caption.uploadConfirm')}
                // Closes at once; the row button shows the upload in progress
                onConfirm={() => { uploadCaptions(recordingId); }}
                okText={t('caption.upload')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" icon={<FileTextOutlined />} loading={captionIds.has(recordingId)}>
                  {log.captionStatus === 'uploaded' ? t('caption.reupload') : t('caption.upload')}
                </Button>
              </Popconfirm>
            )}

            {hasHistory && (
              <Tooltip title={t('zoomRec.viewSyncLogs')}>
                <Button 
                  icon={<HistoryOutlined />} 
                  size="small"
                  onClick={() => fetchHistory(record)}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Card 
        title={<Space><VideoCameraOutlined /><span>{t('zoomRec.title')}</span></Space>}
        extra={
          <Space>
            <Select value={dateFilter} onChange={setDateFilter} style={{ width: 150 }}>
              <Select.Option value="30">{t('zoomRec.last30')}</Select.Option>
              <Select.Option value="custom">{t('zoomRec.customRange')}</Select.Option>
            </Select>
            {dateFilter === 'custom' && (
              <RangePicker 
                onChange={(dates) => setCustomDateRange(dates as any)}
              />
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAllData()} loading={loading || logsLoading}>{t('common.refresh')}</Button>
          </Space>
        }
      >
      {configs.zoom?.isActive ? (
        <Table
          scroll={{ x: 'max-content' }}
          columns={recordingColumns} 
          dataSource={recordings} 
          rowKey={(record: any) => record.uuid || record.id}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: 10,
            onChange: setCurrentPage,
            showTotal: (total) => t('zoomRec.total', { total }),
          }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Text type="secondary">{t('zoomRec.inactive')}</Text>
        </div>
      )}
      </Card>

      <Modal
        title={t('zoomRec.confirmTitle')}
        open={syncModalVisible}
        onOk={() => {
          if (syncPlaylistId === 'create_new' && !newPlaylistTitle.trim()) {
            message.error(t('playlistPicker.newTitleRequired'));
            return;
          }
          handleManualSync(syncingRecord, syncPrivacyStatus, syncPlaylistId);
          setSyncModalVisible(false);
          setSyncPlaylistId('none');
          setNewPlaylistTitle('');
        }}
        onCancel={() => {
          setSyncModalVisible(false);
          setSyncPlaylistId('none');
          setNewPlaylistTitle('');
        }}
        okText={t('zoomRec.startSync')}
        okButtonProps={{ disabled: quota && quota.unitsRemaining < 1650 }}
      >
        <p>
          {/* Split around the placeholder so the topic can be bold in either language */}
          {(() => {
            const [before, after] = t('zoomRec.aboutToSync', { topic: '\u0000' }).split('\u0000');
            return <>{before}<strong>{syncingRecord?.topic}</strong>{after}</>;
          })()}
        </p>
        
        {syncingRecord && youtubeStatus?.longUploadsStatus !== 'allowed' && syncingRecord.duration > 15 && (
          <Alert
            title={t('zoomRec.tooLongTitle')}
            description={
              <span>
                {t('zoomRec.tooLongDesc')}{' '}
                <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer">{t('zoomRec.verifyHere')}</a>.
              </span>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {quota && quota.unitsRemaining < 1650 && (
          <Alert
            title={t('zoomRec.quotaTitle')}
            description={t('quota.exhausted')}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label={t('zoomRec.selectPrivacy')}>
                <Select 
                  value={syncPrivacyStatus} 
                  onChange={setSyncPrivacyStatus}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="public">{t('privacy.public')}</Select.Option>
                  <Select.Option value="unlisted">{t('privacy.unlisted')}</Select.Option>
                  <Select.Option value="private">{t('privacy.private')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('field.playlist')}>
                <Select 
                  value={syncPlaylistId} 
                  onChange={setSyncPlaylistId}
                  style={{ width: '100%' }}
                  loading={loadingPlaylists}
                >
                  <Select.Option value="none">{t('playlistPicker.none')}</Select.Option>
                  {playlists.map(p => (
                    <Select.Option key={p.id} value={p.id}>{p.title}</Select.Option>
                  ))}
                  <Select.Option value="create_new">{t('playlistPicker.createNew')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {syncPlaylistId === 'create_new' && (
            <Form.Item label={t('playlistPicker.newTitle')} required>
              <Input 
                placeholder={t('playlistPicker.newTitlePlaceholder')} 
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={selectedRecording?.topic}
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailsVisible(false)}>{t('common.close')}</Button>
        ]}
        width={800}
      >
        {selectedRecording && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={t('zoomRec.topic')}>{selectedRecording.topic}</Descriptions.Item>
              <Descriptions.Item label={t('zoomRec.startTime')}>{fmt.dateTime(selectedRecording.start_time)}</Descriptions.Item>
              <Descriptions.Item label={t('zoomRec.duration')}>{t('zoomRec.minutes', { count: selectedRecording.duration })}</Descriptions.Item>
              {(() => {
                const log = logs.find((l: any) => l.recordingId === (selectedRecording.uuid || selectedRecording.id));
                if (!log || log.syncStatus !== 'COMPLETED' || !log.youtubeVideoId) return null;
                return (
                  <Descriptions.Item label="YouTube">
                    <Space>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0 }}
                        href={`https://www.youtube.com/watch?v=${log.youtubeVideoId}`}
                        target="_blank"
                      >
                        {t('common.viewOnYouTube')}
                      </Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => setEditingVideoId(log.youtubeVideoId)}>
                        {t('common.edit')}
                      </Button>
                    </Space>
                  </Descriptions.Item>
                );
              })()}
            </Descriptions>

            <Divider titlePlacement="left"><PlayCircleOutlined /> {t('zoomRec.videoPreview')}</Divider>
            {selectedRecording.recording_files?.find((f: any) => f.file_type === 'MP4') ? (
              <div style={{ textAlign: 'center', background: '#000', padding: 20 }}>
                <Text style={{ color: '#fff' }}>{t('zoomRec.previewPlaceholder')}</Text>
                <br/>
                <Button 
                  icon={<PlayCircleOutlined />} 
                  href={selectedRecording.recording_files.find((f: any) => f.file_type === 'MP4').download_url}
                  target="_blank"
                  type="primary"
                  style={{ marginTop: 10 }}
                >
                  {t('zoomRec.watchVideo')}
                </Button>
              </div>
            ) : <Alert title={t('zoomRec.noVideoFile')} type="warning" />}

            <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
              <Col xs={24} sm={8}>
                <Card size="small" title={<Space><AudioOutlined /> {t('zoomRec.audio')}</Space>}>
                  {selectedRecording.recording_files?.find((f: any) => f.file_type === 'M4A') ? (
                    <Button type="link" href={selectedRecording.recording_files.find((f: any) => f.file_type === 'M4A').download_url} target="_blank">{t('zoomRec.downloadAudio')}</Button>
                  ) : <Text type="secondary">{t('zoomRec.notAvailable')}</Text>}
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small" title={<Space><MessageOutlined /> {t('zoomRec.chat')}</Space>}>
                   {selectedRecording.recording_files?.find((f: any) => f.file_type === 'CHAT') ? (
                    <Button type="link" href={selectedRecording.recording_files.find((f: any) => f.file_type === 'CHAT').download_url} target="_blank">{t('zoomRec.downloadChat')}</Button>
                  ) : <Text type="secondary">{t('zoomRec.notAvailable')}</Text>}
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small" title={<Space><FilePdfOutlined /> {t('zoomRec.transcript')}</Space>}>
                  {selectedRecording.recording_files?.find((f: any) => f.file_type === 'TRANSCRIPT') ? (
                    <Button type="link" href={selectedRecording.recording_files.find((f: any) => f.file_type === 'TRANSCRIPT').download_url} target="_blank">{t('zoomRec.downloadTranscript')}</Button>
                  ) : <Text type="secondary">{t('zoomRec.notAvailable')}</Text>}
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      <EditVideoModal
        videoId={editingVideoId}
        open={!!editingVideoId}
        onClose={() => setEditingVideoId(null)}
        onSaved={() => fetchQuota()}
      />

      <Modal
        title={t('zoomRec.linkPickerTitle')}
        open={!!pickerRecord}
        onCancel={() => setPickerRecord(null)}
        onOk={() => pickerRecord && pickedVideoId && linkRecording(pickerRecord, pickedVideoId, 'picker')}
        okText={t('zoomRec.link')}
        cancelText={t('common.cancel')}
        okButtonProps={{
          disabled: !pickedVideoId,
          loading: pickerRecord ? linkingIds.has(pickerRecord.uuid || pickerRecord.id) : false,
        }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {t('zoomRec.linkPickerHint', { topic: pickerRecord?.topic || '' })}
        </Text>
        {!channelVideosLoading && channelVideos.length === 0 ? (
          <Alert type="info" showIcon title={t('zoomRec.linkPickerEmpty')} />
        ) : (
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder={t('zoomRec.linkPickerPlaceholder')}
            loading={channelVideosLoading}
            value={pickedVideoId}
            onChange={setPickedVideoId}
            optionFilterProp="title"
            options={channelVideos.map((v: any) => ({
              value: v.videoId,
              title: v.title,
              // A video already linked to another recording can't take a second one
              disabled: !!v.zoomSync,
              label: (
                <Space orientation="vertical" size={0}>
                  <Text ellipsis style={{ maxWidth: 400 }}>{v.title}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {[
                      formatSeconds(v.durationSeconds),
                      v.publishedAt ? fmt.date(v.publishedAt) : null,
                      v.zoomSync ? t('zoomRec.alreadyLinkedTo', { meeting: v.zoomSync.meeting }) : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </Space>
              ),
            }))}
          />
        )}
      </Modal>

      <SyncHistoryModal
        open={!!historyRecording}
        recordingId={historyRecording ? (historyRecording.uuid || historyRecording.id) : null}
        topic={historyRecording?.topic}
        playlists={playlists}
        onClose={() => setHistoryRecording(null)}
      />
    </>
  );
}
