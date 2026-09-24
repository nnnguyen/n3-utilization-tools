'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Row, Col, Form, Input, Select, Upload, Progress, Typography, message } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { apiFetch, API_URL } from '@/lib/api';
import { authHeaders } from '@/lib/auth-token';
import { translateNow, useT } from '@/lib/i18n';

const { Text } = Typography;
const { Dragger } = Upload;

interface YoutubePlaylist {
  id: string;
  title: string;
}

interface UploadVideoModalProps {
  open: boolean;
  onClose: () => void;
  // Called after a successful upload (the modal closes itself)
  onUploaded?: () => void;
  hasEnoughQuota: boolean;
}

// XHR instead of apiFetch: fetch() cannot report upload progress
function uploadWithProgress(
  formData: FormData,
  onProgress: (percent: number) => void,
  onSentToServer: () => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/youtube/upload`);
    xhr.withCredentials = true;
    Object.entries(authHeaders()).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    // Browser finished sending; the backend is now streaming to YouTube
    xhr.upload.onload = onSentToServer;
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const msg = data?.message;
        reject(new Error((Array.isArray(msg) ? msg[0] : msg) || translateNow('upload.failedStatus', { status: xhr.status })));
      }
    };
    xhr.onerror = () => reject(new Error(translateNow('upload.networkError')));
    xhr.send(formData);
  });
}

export default function UploadVideoModal({ open, onClose, onUploaded, hasEnoughQuota }: UploadVideoModalProps) {
  const t = useT();
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // 'server' = browser -> backend (real %), 'youtube' = backend -> YouTube (no % available)
  const [uploadPhase, setUploadPhase] = useState<'server' | 'youtube' | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [playlists, setPlaylists] = useState<YoutubePlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');

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

  useEffect(() => {
    if (open) fetchPlaylists();
  }, [open]);

  const resetForm = () => {
    form.resetFields();
    setFileList([]);
    setNewPlaylistTitle('');
    setProgress(0);
  };

  const handleCancel = () => {
    // Closing mid-upload would hide the progress while the request keeps running
    if (uploading) return;
    resetForm();
    onClose();
  };

  const onFinish = async (values: any) => {
    if (!hasEnoughQuota) {
      message.error(t('quota.exhausted'));
      return;
    }
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error(t('upload.selectFile'));
      return;
    }
    if (values.playlist === 'create_new' && !newPlaylistTitle.trim()) {
      message.error(t('playlistPicker.newTitleRequired'));
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      let playlistId = values.playlist;

      if (playlistId === 'create_new') {
        const newPlaylist = await apiFetch('/youtube/playlists', {
          method: 'POST',
          body: JSON.stringify({
            title: newPlaylistTitle,
            privacyStatus: values.privacy
          })
        });
        playlistId = newPlaylist.id;
        message.success(t('playlistPicker.created', { title: newPlaylistTitle }));
        fetchPlaylists(); // Refresh playlist list
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', values.title);
      if (values.description) formData.append('description', values.description);
      formData.append('privacyStatus', values.privacy);
      if (playlistId && playlistId !== 'none') formData.append('playlistId', playlistId);

      setUploadPhase('server');
      const result = await uploadWithProgress(formData, setProgress, () => setUploadPhase('youtube'));

      if (result?.playlistError) {
        message.warning(t('upload.playlistFailed', { error: result.playlistError }));
      } else {
        message.success(t('upload.success'));
      }
      resetForm();
      onClose();
      onUploaded?.();
    } catch (error: any) {
      console.error('Upload failed:', error);
      message.error(error.message || t('upload.failed'));
    } finally {
      setUploading(false);
      setUploadPhase(null);
    }
  };

  return (
    <Modal
      title={t('upload.title')}
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      okText={t('upload.start')}
      okButtonProps={{ icon: <UploadOutlined />, loading: uploading, disabled: !hasEnoughQuota }}
      cancelButtonProps={{ disabled: uploading }}
      closable={!uploading}
      mask={{ closable: false }}
      keyboard={!uploading}
      width={720}
    >
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={uploading}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item label={t('upload.videoTitle')} name="title" rules={[{ required: true, whitespace: true, message: t('validation.titleRequired') }, { max: 100, message: t('validation.maxChars', { field: t('field.title'), max: 100 }) }]}>
              <Input placeholder={t('upload.videoTitlePlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label={t('field.privacyStatus')} name="privacy" initialValue="private">
              <Select>
                <Select.Option value="public">{t('privacy.public')}</Select.Option>
                <Select.Option value="unlisted">{t('privacy.unlisted')}</Select.Option>
                <Select.Option value="private">{t('privacy.private')}</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label={t('field.playlist')} name="playlist" initialValue="none">
              <Select
                loading={loadingPlaylists}
                onChange={(val) => {
                  if (val !== 'create_new') setNewPlaylistTitle('');
                }}
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

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => prevValues.playlist !== currentValues.playlist}
        >
          {({ getFieldValue }) =>
            getFieldValue('playlist') === 'create_new' ? (
              <Form.Item
                label={t('playlistPicker.newTitle')}
                required
                style={{ marginBottom: 16 }}
              >
                <Input
                  placeholder={t('playlistPicker.newTitlePlaceholder')}
                  value={newPlaylistTitle}
                  onChange={(e) => setNewPlaylistTitle(e.target.value)}
                />
              </Form.Item>
            ) : null
          }
        </Form.Item>

        <Form.Item label={t('field.description')} name="description" rules={[{ max: 5000, message: t('validation.maxChars', { field: t('field.description'), max: 5000 }) }]}>
          <Input.TextArea rows={3} placeholder={t('upload.descriptionPlaceholder')} />
        </Form.Item>
        <Form.Item label={t('upload.videoFile')} required>
          <Dragger
            maxCount={1}
            accept="video/*"
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">{t('upload.dropText')}</p>
            <p className="ant-upload-hint">{t('upload.dropHint')}</p>
          </Dragger>
        </Form.Item>
        {uploading && (
          <div>
            <Text type="secondary">
              {uploadPhase === 'youtube' ? t('upload.phaseYoutube') : t('upload.phaseServer')}
            </Text>
            <Progress percent={uploadPhase === 'youtube' ? 100 : progress} status="active" />
          </div>
        )}
        {!hasEnoughQuota && (
          <Text type="danger">{t('quota.exhausted')}</Text>
        )}
      </Form>
    </Modal>
  );
}
