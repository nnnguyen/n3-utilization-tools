'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Form, Input, Select, Table, Space, Alert, message, Spin, Divider, DatePicker, Modal, Descriptions, Progress, Tooltip } from 'antd';
import { VideoCameraOutlined, HistoryOutlined, YoutubeOutlined, ReloadOutlined, FilePdfOutlined, AudioOutlined, MessageOutlined, PlayCircleOutlined, EditOutlined } from '@ant-design/icons';
import EditVideoModal from './EditVideoModal';
import SyncHistoryModal from './SyncHistoryModal';
import { apiFetch } from '@/lib/api';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Zoom Recordings table with its sync flow (moved as-is from the Zoom
// Utilities page into YouTube → Channel Content → Zoom Sync)
export default function ZoomRecordingsPanel() {
  const [recordings, setRecordings] = useState([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });
  
  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecordings, setTotalRecordings] = useState(0);
  const [dateFilter, setDateFilter] = useState<string>('30');
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string>('');

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

  // History Modal
  const [historyRecording, setHistoryRecording] = useState<any>(null);

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
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
      message.error('Failed to load integration settings');
    } finally {
      setConfigsLoading(false);
    }
  };

  const fetchRecordings = async (token?: string) => {
    setLoading(true);
    try {
      let from: string | undefined;
      let to: string | undefined;

      if (dateFilter !== 'custom') {
        const days = parseInt(dateFilter);
        from = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
        to = dayjs().format('YYYY-MM-DD');
      } else if (customDateRange) {
        from = customDateRange[0].format('YYYY-MM-DD');
        to = customDateRange[1].format('YYYY-MM-DD');
      }

      const queryParams = new URLSearchParams();
      queryParams.append('page_size', '10');
      if (token) queryParams.append('next_page_token', token);
      if (from) queryParams.append('from', from);
      if (to) queryParams.append('to', to);

      const response = await apiFetch(`/zoom/recordings?${queryParams.toString()}`);
      setRecordings(response.meetings || []);
      setNextPageToken(response.next_page_token || '');
      setTotalRecordings(response.total_records || 0);
    } catch (error: any) {
      console.error('Error fetching recordings:', error);
      message.error(error.message || 'Failed to fetch Zoom recordings. Please check your credentials.');
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

  const fetchPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const data = await apiFetch('/youtube/playlists');
      setPlaylists(data);
    } catch (error) {
      console.error('Failed to fetch playlists', error);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const fetchAllData = async (token?: string) => {
    await Promise.all([
      fetchRecordings(token),
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

  const handleManualSync = async (record: any, privacyStatus: string = 'private', playlistId?: string) => {
    if (quota && quota.unitsRemaining < 1650) {
      message.error('Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai');
      return;
    }
    const recordingId = record.uuid || record.id;
    setSyncingIds(prev => new Set(prev).add(recordingId));
    try {
      let finalPlaylistId = playlistId === 'none' ? undefined : playlistId;
      
      if (playlistId === 'create_new') {
        if (!newPlaylistTitle) {
          message.error('Please enter a title for the new playlist');
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
        message.success(`Playlist "${newPlaylistTitle}" created`);
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
      message.success(`Sync started for: ${record.topic} (${privacyStatus})`);
      // Immediately fetch logs and recordings to show "Processing" state
      await fetchAllData();
    } catch (error: any) {
      console.error('Manual sync failed:', error);
      message.error(error.message || `Failed to sync: ${record.topic}`);
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
      title: 'Topic',
      dataIndex: 'topic',
      key: 'topic',
      sorter: (a: any, b: any) => a.topic.localeCompare(b.topic),
    },
    {
      title: 'Start Time',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (text: string) => new Date(text).toLocaleString(),
      sorter: (a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Duration (min)',
      dataIndex: 'duration',
      key: 'duration',
      sorter: (a: any, b: any) => a.duration - b.duration,
    },
    {
      title: 'File',
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
            Download Link
          </Button>
        );
      },
    },
    {
      title: 'Status',
      key: 'syncStatus',
      render: (record: any) => {
        const recordingId = record.uuid || record.id;
        const log = logs.find((l: any) => l.recordingId === recordingId);
        
        if (!log) return <Tag color="default">Not synced</Tag>;

        const status = log.syncStatus || 'PENDING';
        
        switch (status) {
          case 'UPLOADING':
            return (
              <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                <Tag color="blue"><Spin size="small" style={{ marginRight: 8 }} />Uploading</Tag>
                {log.progress > 0 && <Progress percent={log.progress} size="small" status="active" />}
              </Space>
            );
          case 'PROCESSING':
            const duration = log.syncStartedAt ? Math.floor((new Date().getTime() - new Date(log.syncStartedAt).getTime()) / 60000) : 0;
            return <Tag color="warning">Processing {duration > 0 ? `(${duration}m)` : ''}</Tag>;
          case 'COMPLETED':
            return <Tag color="success">Ready</Tag>;
          case 'FAILED':
            return (
              <Space orientation="vertical" size={0}>
                <Tooltip title={log.syncError || 'Unknown error'}>
                  <Tag color="error" style={{ cursor: 'pointer' }}>Failed</Tag>
                </Tooltip>
                {log.nextRetryAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Tự động thử lại lúc {dayjs(log.nextRetryAt).format('HH:mm')} (lần {log.autoRetryCount + 1}/3)
                  </Text>
                )}
              </Space>
            );
          case 'PENDING':
          default:
            return <Tag color="default">Not synced</Tag>;
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
              Watch on YouTube
            </Button>
          );
        }
        return '—';
      }
    },
    {
      title: 'Action',
      key: 'action',
      render: (record: any) => {
        const recordingId = record.uuid || record.id;
        const log = logs.find((l: any) => l.recordingId === recordingId);
        
        const isSyncing = syncingIds.has(recordingId) || (log && (log.syncStatus === 'UPLOADING' || log.syncStatus === 'PROCESSING'));
        const isCompleted = log && log.syncStatus === 'COMPLETED';
        const isFailed = log && log.syncStatus === 'FAILED';
        const hasHistory = log && log.syncStatus !== 'PENDING';

        return (
          <Space>
            <Button 
              type="default" 
              size="small"
              onClick={() => {
                setSelectedRecording(record);
                setDetailsVisible(true);
              }}
            >
              Details
            </Button>
            
            {!isCompleted && (
              <Button 
                icon={<YoutubeOutlined />} 
                size="small"
                onClick={() => {
                  setSyncingRecord(record);
                  setSyncPrivacyStatus('private');
                  setSyncModalVisible(true);
                }}
                loading={syncingIds.has(recordingId)}
                disabled={isSyncing && !isFailed}
                danger={isFailed}
                type={isFailed ? 'primary' : 'default'}
              >
                {isFailed ? 'Re-sync' : isSyncing ? 'Processing...' : 'Sync'}
              </Button>
            )}

            {hasHistory && (
              <Tooltip title="View sync logs">
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
        title={<Space><VideoCameraOutlined /><span>Zoom Recordings</span></Space>}
        extra={
          <Space>
            <Select value={dateFilter} onChange={setDateFilter} style={{ width: 150 }}>
              <Select.Option value="30">Last 30 days</Select.Option>
              <Select.Option value="custom">Custom Range</Select.Option>
            </Select>
            {dateFilter === 'custom' && (
              <RangePicker 
                onChange={(dates) => setCustomDateRange(dates as any)}
              />
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAllData()} loading={loading || logsLoading}>Refresh</Button>
          </Space>
        }
      >
      {configs.zoom?.isActive ? (
        <Table 
          columns={recordingColumns} 
          dataSource={recordings} 
          rowKey={(record: any) => record.uuid || record.id}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: 10,
            total: totalRecordings,
            onChange: (page) => {
              setCurrentPage(page);
              fetchRecordings(nextPageToken);
            }
          }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Text type="secondary">Zoom integration is inactive. Recordings cannot be displayed.</Text>
        </div>
      )}
      </Card>

      <Modal
        title="Confirm YouTube Sync"
        open={syncModalVisible}
        onOk={() => {
          if (syncPlaylistId === 'create_new' && !newPlaylistTitle.trim()) {
            message.error('Please enter a title for the new playlist');
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
        okText="Start Sync"
        okButtonProps={{ disabled: quota && quota.unitsRemaining < 1650 }}
      >
        <p>You are about to sync <strong>{syncingRecord?.topic}</strong> to YouTube.</p>
        
        {syncingRecord && youtubeStatus?.longUploadsStatus !== 'allowed' && syncingRecord.duration > 15 && (
          <Alert
            title="Video quá dài (> 15 phút)"
            description={
              <span>
                Channel YouTube của bạn chưa verify nên giới hạn video dưới 15 phút. 
                Sync video này có thể bị YouTube từ chối. 
                Hãy <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer">xác minh channel tại đây</a> trước.
              </span>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {quota && quota.unitsRemaining < 1650 && (
          <Alert
            title="Hết Quota"
            description="Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai."
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Select Privacy Status">
                <Select 
                  value={syncPrivacyStatus} 
                  onChange={setSyncPrivacyStatus}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="public">Public</Select.Option>
                  <Select.Option value="unlisted">Unlisted</Select.Option>
                  <Select.Option value="private">Private</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Playlist">
                <Select 
                  value={syncPlaylistId} 
                  onChange={setSyncPlaylistId}
                  style={{ width: '100%' }}
                  loading={loadingPlaylists}
                >
                  <Select.Option value="none">None</Select.Option>
                  {playlists.map(p => (
                    <Select.Option key={p.id} value={p.id}>{p.title}</Select.Option>
                  ))}
                  <Select.Option value="create_new">+ Create new playlist...</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {syncPlaylistId === 'create_new' && (
            <Form.Item label="New Playlist Title" required>
              <Input 
                placeholder="Enter new playlist title" 
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
          <Button key="close" onClick={() => setDetailsVisible(false)}>Close</Button>
        ]}
        width={800}
      >
        {selectedRecording && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Topic">{selectedRecording.topic}</Descriptions.Item>
              <Descriptions.Item label="Start Time">{new Date(selectedRecording.start_time).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Duration">{selectedRecording.duration} minutes</Descriptions.Item>
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
                        View on YouTube
                      </Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => setEditingVideoId(log.youtubeVideoId)}>
                        Edit
                      </Button>
                    </Space>
                  </Descriptions.Item>
                );
              })()}
            </Descriptions>

            <Divider titlePlacement="left"><PlayCircleOutlined /> Video Preview</Divider>
            {selectedRecording.recording_files?.find((f: any) => f.file_type === 'MP4') ? (
              <div style={{ textAlign: 'center', background: '#000', padding: 20 }}>
                <Text style={{ color: '#fff' }}>Video preview would be here (Streamed from Zoom)</Text>
                <br/>
                <Button 
                  icon={<PlayCircleOutlined />} 
                  href={selectedRecording.recording_files.find((f: any) => f.file_type === 'MP4').download_url}
                  target="_blank"
                  type="primary"
                  style={{ marginTop: 10 }}
                >
                  Watch Video
                </Button>
              </div>
            ) : <Alert title="No video file available" type="warning" />}

            <Row gutter={16} style={{ marginTop: 20 }}>
              <Col span={8}>
                <Card size="small" title={<Space><AudioOutlined /> Audio</Space>}>
                  {selectedRecording.recording_files?.find((f: any) => f.file_type === 'M4A') ? (
                    <Button type="link" href={selectedRecording.recording_files.find((f: any) => f.file_type === 'M4A').download_url} target="_blank">Download Audio</Button>
                  ) : <Text type="secondary">Not available</Text>}
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title={<Space><MessageOutlined /> Chat</Space>}>
                   {selectedRecording.recording_files?.find((f: any) => f.file_type === 'CHAT') ? (
                    <Button type="link" href={selectedRecording.recording_files.find((f: any) => f.file_type === 'CHAT').download_url} target="_blank">Download Chat</Button>
                  ) : <Text type="secondary">Not available</Text>}
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title={<Space><FilePdfOutlined /> Transcript</Space>}>
                  {selectedRecording.recording_files?.find((f: any) => f.file_type === 'TRANSCRIPT') ? (
                    <Button type="link" href={selectedRecording.recording_files.find((f: any) => f.file_type === 'TRANSCRIPT').download_url} target="_blank">Download Transcript</Button>
                  ) : <Text type="secondary">Not available</Text>}
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
