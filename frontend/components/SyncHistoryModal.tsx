'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Button, List, Space, Spin, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

const { Text } = Typography;

interface SyncHistoryModalProps {
  open: boolean;
  recordingId: string | null;
  // Shown in the header; falls back to the log's meeting name
  topic?: string | null;
  // Used to show playlist names instead of ids when available
  playlists?: { id: string; title: string }[];
  onClose: () => void;
}

// Sync log of one Zoom recording. Used by Channel Content → Zoom Sync and
// by the "Xem sync log" action in Channel Content → Videos.
export default function SyncHistoryModal({ open, recordingId, topic, playlists = [], onClose }: SyncHistoryModalProps) {
  const t = useT();
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!open || !recordingId) return;
    const load = async () => {
      setHistoryLoading(true);
      setHistoryLogs([]);
      try {
        const response = await apiFetch(`/zoom/logs?recordingId=${encodeURIComponent(recordingId)}`);
        setHistoryLogs(response);
      } catch (error: any) {
        message.error(t('syncHistory.loadFailed'));
      } finally {
        setHistoryLoading(false);
      }
    };
    load();
  }, [open, recordingId]);

  return (
    <Modal
      title={t('syncHistory.title')}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>{t('common.close')}</Button>
      ]}
      width={700}
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong>{t('syncHistory.recording')} </Text> <Text>{topic || historyLogs[0]?.meeting}</Text>
      </div>
      <Spin spinning={historyLoading}>
        <List
          dataSource={historyLogs}
          rowKey={(log: any) => log.id}
          renderItem={(log: any) => (
            <List.Item>
              <div style={{ width: '100%' }}>
                <div style={{ marginBottom: 8 }}>
                  <Space>
                    <Text>{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    {log.event && <Tag>{log.event}</Tag>}
                    <Tag color={log.syncStatus === 'COMPLETED' ? 'success' : log.syncStatus === 'FAILED' ? 'error' : 'processing'}>
                      {log.syncStatus === 'COMPLETED' ? t('sync.status.success') : log.syncStatus === 'FAILED' ? t('sync.status.failed') : log.syncStatus}
                    </Tag>
                  </Space>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {log.syncStatus === 'FAILED' && (
                    <>
                      <Text type="danger" strong>{log.syncError}</Text>
                      {log.errorSource === 'youtube_processing' && (
                        <Text type="secondary" italic>{t('syncHistory.afterUpload')}</Text>
                      )}
                    </>
                  )}
                  
                  {log.syncStatus === 'COMPLETED' && log.youtubeVideoId && (
                    <Button 
                      type="link" 
                      size="small" 
                      style={{ padding: 0, textAlign: 'left', width: 'fit-content' }}
                      href={`https://www.youtube.com/watch?v=${log.youtubeVideoId}`} 
                      target="_blank"
                    >
                      {t('common.viewOnYouTube')}
                    </Button>
                  )}

                  {log.syncStatus === 'FAILED' && log.nextRetryAt && (
                    <Text type="secondary">
                      {t('syncHistory.retryScheduled', { time: dayjs(log.nextRetryAt).format('HH:mm:ss'), attempt: log.autoRetryCount + 1 })}
                    </Text>
                  )}

                  {log.playlistId && (
                    <Text type="secondary">
                      {t('syncHistory.playlist')}{' '}
                      <a href={`https://www.youtube.com/playlist?list=${log.playlistId}`} target="_blank" rel="noreferrer">
                        {playlists.find(p => p.id === log.playlistId)?.title || log.playlistId}
                      </a>
                    </Text>
                  )}
                  {log.playlistError && (
                    <Text type="warning">{t('syncHistory.playlistError', { error: log.playlistError })}</Text>
                  )}

                  {(log.errorCode || log.errorMessage) && (
                    <details style={{ marginTop: 8, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--color-accent)' }}>{t('syncHistory.technicalDetails')}</summary>
                      <div style={{ padding: '8px', background: 'var(--color-bg)', borderRadius: '4px', marginTop: 4 }}>
                        {log.errorCode && <div><Text strong>{t('syncHistory.errorCode')}</Text> {log.errorCode}</div>}
                        {log.errorMessage && <div><Text strong>{t('syncHistory.errorMessage')}</Text> {log.errorMessage}</div>}
                        {log.errorSource && <div><Text strong>{t('syncHistory.source')}</Text> {log.errorSource}</div>}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </List.Item>
          )}
        />
      </Spin>
    </Modal>
  );
}
