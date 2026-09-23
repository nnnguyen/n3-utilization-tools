'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Row, Col, Form, Input, Select, Upload, Progress, Typography, message } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { apiFetch, API_URL } from '@/lib/api';

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
        reject(new Error((Array.isArray(msg) ? msg[0] : msg) || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

export default function UploadVideoModal({ open, onClose, onUploaded, hasEnoughQuota }: UploadVideoModalProps) {
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
      message.error('Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai');
      return;
    }
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error('Please select a video file');
      return;
    }
    if (values.playlist === 'create_new' && !newPlaylistTitle.trim()) {
      message.error('Please enter a title for the new playlist');
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
        message.success(`Playlist "${newPlaylistTitle}" created`);
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
        message.warning(`Video đã upload nhưng không gán được vào playlist: ${result.playlistError}`);
      } else {
        message.success('Video uploaded successfully!');
      }
      resetForm();
      onClose();
      onUploaded?.();
    } catch (error: any) {
      console.error('Upload failed:', error);
      message.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadPhase(null);
    }
  };

  return (
    <Modal
      title="Upload Video"
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      okText="Start Upload"
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
            <Form.Item label="Video Title" name="title" rules={[{ required: true, whitespace: true }, { max: 100, message: 'Title must be at most 100 characters' }]}>
              <Input placeholder="Enter video title" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Privacy Status" name="privacy" initialValue="private">
              <Select>
                <Select.Option value="public">Public</Select.Option>
                <Select.Option value="unlisted">Unlisted</Select.Option>
                <Select.Option value="private">Private</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Playlist" name="playlist" initialValue="none">
              <Select
                loading={loadingPlaylists}
                onChange={(val) => {
                  if (val !== 'create_new') setNewPlaylistTitle('');
                }}
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

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => prevValues.playlist !== currentValues.playlist}
        >
          {({ getFieldValue }) =>
            getFieldValue('playlist') === 'create_new' ? (
              <Form.Item
                label="New Playlist Title"
                required
                style={{ marginBottom: 16 }}
              >
                <Input
                  placeholder="Enter new playlist title"
                  value={newPlaylistTitle}
                  onChange={(e) => setNewPlaylistTitle(e.target.value)}
                />
              </Form.Item>
            ) : null
          }
        </Form.Item>

        <Form.Item label="Description" name="description" rules={[{ max: 5000, message: 'Description must be at most 5000 characters' }]}>
          <Input.TextArea rows={3} placeholder="Video description..." />
        </Form.Item>
        <Form.Item label="Video File" required>
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
            <p className="ant-upload-text">Click or drag file to this area to upload</p>
            <p className="ant-upload-hint">Support for a single MP4, MOV upload.</p>
          </Dragger>
        </Form.Item>
        {uploading && (
          <div>
            <Text type="secondary">
              {uploadPhase === 'youtube' ? 'Đang đẩy video lên YouTube...' : 'Đang tải file lên server...'}
            </Text>
            <Progress percent={uploadPhase === 'youtube' ? 100 : progress} status="active" />
          </div>
        )}
        {!hasEnoughQuota && (
          <Text type="danger">Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai</Text>
        )}
      </Form>
    </Modal>
  );
}
