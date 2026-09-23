'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Upload, Form, Input, Select, Table, Space, Progress, message, Avatar, Spin } from 'antd';
import type { UploadFile } from 'antd';
import { YoutubeOutlined, UploadOutlined, LinkOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import EditVideoModal from '../../components/EditVideoModal';
import { apiFetch, API_URL } from '@/lib/api';
import { Tooltip } from 'antd';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface YoutubeStatus {
  connected: boolean;
  reason?: 'not_configured' | 'invalid_credentials';
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string | null;
  longUploadsStatus?: 'allowed' | 'disallowed' | 'eligible' | 'unknown';
}

interface YoutubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  privacyStatus: string;
}

interface YoutubePlaylist {
  id: string;
  title: string;
}

interface YoutubeQuota {
  unitsUsed: number;
  unitsRemaining: number;
  quotaLimit: number;
  estimatedUploadsRemaining: number;
  date: string;
}

const STATUS_MESSAGE: Record<string, string | React.ReactNode> = {
  not_configured: (
    <span>
      YouTube integration is not fully configured. 
      Go to <Link href="/integrations?tab=youtube" style={{ color: '#1890ff' }}>Integrations</Link> to set Client ID, Secret and Authorize.
    </span>
  ),
  invalid_credentials: (
    <span>
      The configured YouTube credentials are invalid or expired. 
      Please <Link href="/integrations?tab=youtube" style={{ color: '#1890ff' }}>Authorize</Link> again in Integrations.
    </span>
  ),
};

export default function YoutubeUtilities() {
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recentUploads, setRecentUploads] = useState<YoutubeVideo[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [quota, setQuota] = useState<YoutubeQuota | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [playlists, setPlaylists] = useState<YoutubePlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  // 'server' = browser -> backend (real %), 'youtube' = backend -> YouTube (no % available)
  const [uploadPhase, setUploadPhase] = useState<'server' | 'youtube' | null>(null);
  const [form] = Form.useForm();
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const data = await apiFetch('/youtube/status');
      setStatus(data);
      if (data.connected) {
        fetchRecentUploads();
        fetchQuota();
        fetchPlaylists();
      }
    } catch (error) {
      setStatus({ connected: false, reason: 'invalid_credentials' });
    } finally {
      setCheckingStatus(false);
    }
  };

  const fetchQuota = async () => {
    setLoadingQuota(true);
    try {
      const data = await apiFetch('/youtube/quota');
      setQuota(data);
    } catch (error) {
      console.error('Failed to fetch quota', error);
    } finally {
      setLoadingQuota(false);
    }
  };

  const fetchRecentUploads = async () => {
    setLoadingUploads(true);
    try {
      const data = await apiFetch('/youtube/recent-uploads');
      setRecentUploads(data);
    } catch (error) {
      console.error('Failed to fetch recent uploads', error);
      message.error('Failed to fetch recent uploads');
    } finally {
      setLoadingUploads(false);
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

  useEffect(() => {
    checkStatus();
  }, []);

  const isConnected = status?.connected ?? false;
  const hasEnoughQuota = quota ? quota.unitsRemaining >= 1650 : true;

  const columns = [
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
      render: (status: string) => (
        <Tag color={status === 'public' ? 'green' : status === 'unlisted' ? 'blue' : 'orange'}>
          {(status || 'unknown').toUpperCase()}
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

      const result = await uploadWithProgress(formData);

      if (result?.playlistError) {
        message.warning(`Video đã upload nhưng không gán được vào playlist: ${result.playlistError}`);
      } else {
        message.success('Video uploaded successfully!');
      }
      form.resetFields();
      setFileList([]);
      setNewPlaylistTitle('');
      fetchRecentUploads();
      fetchQuota();
    } catch (error: any) {
      console.error('Upload failed:', error);
      message.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadPhase(null);
    }
  };

  // XHR instead of apiFetch: fetch() cannot report upload progress
  const uploadWithProgress = (formData: FormData): Promise<any> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/youtube/upload`);
      xhr.withCredentials = true;
      setUploadPhase('server');
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          setProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
      // Browser finished sending; the backend is now streaming to YouTube
      xhr.upload.onload = () => setUploadPhase('youtube');
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

  const getQuotaColor = (percent: number) => {
    if (percent < 70) return '#52c41a'; // xanh
    if (percent < 90) return '#faad14'; // vàng
    return '#ff4d4f'; // đỏ
  };

  const quotaPercent = quota ? Math.min(100, (quota.unitsUsed / quota.quotaLimit) * 100) : 0;

  return (
    <DashboardLayout>
      <Title level={2}>YouTube Utilities</Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <Card title="Connection Status" extra={<YoutubeOutlined style={{ color: '#ff0000', fontSize: 20 }} />}>
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                {checkingStatus ? (
                  <Spin />
                ) : isConnected ? (
                  <>
                    {status?.channelThumbnail ? (
                      <Avatar size={64} src={status.channelThumbnail} style={{ marginBottom: 16 }} />
                    ) : (
                      <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                    )}
                    <Title level={4} style={{ margin: 0 }}>Connected</Title>
                    <Text type="secondary">Channel: {status?.channelTitle}</Text>
                    
                    <div style={{ marginTop: 12 }}>
                      {status?.longUploadsStatus === 'allowed' ? (
                        <Tag color="success">Verified — Video &gt;15m OK</Tag>
                      ) : (
                        <Tooltip title="Channel chưa verify số điện thoại sẽ bị giới hạn video dưới 15 phút.">
                          <Tag color="warning" style={{ cursor: 'help' }}>
                            Giới hạn video &lt; 15m
                          </Tag>
                        </Tooltip>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer">Xác minh tại đây</a>
                        </Text>
                      </div>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <Button icon={<ReloadOutlined />} onClick={checkStatus} size="small">Recheck Status</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <CloseCircleOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                    <Title level={4} style={{ margin: 0 }}>Not Connected</Title>
                    <Text type="secondary">
                      {STATUS_MESSAGE[status?.reason ?? 'not_configured']}
                    </Text>
                    <div style={{ marginTop: 20 }}>
                      <Button icon={<ReloadOutlined />} onClick={checkStatus} size="small">Check Again</Button>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {isConnected && (
              <Card title="Quota hôm nay" extra={<InfoCircleOutlined style={{ color: '#1890ff' }} />}>
                {loadingQuota ? (
                  <Spin size="small" />
                ) : quota ? (
                  <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary">Sử dụng:</Text>
                      <Text strong>{quota.unitsUsed.toLocaleString()} / {quota.quotaLimit.toLocaleString()} units</Text>
                    </div>
                    <Progress 
                      percent={quotaPercent} 
                      strokeColor={getQuotaColor(quotaPercent)} 
                      showInfo={false} 
                      status={quotaPercent > 90 ? 'exception' : 'active'}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Text type={hasEnoughQuota ? 'secondary' : 'danger'}>
                        Còn ~{quota.estimatedUploadsRemaining} lượt upload
                      </Text>
                    </div>
                    {!hasEnoughQuota && (
                      <div style={{ marginTop: 8 }}>
                        <Tag color="red">Hết Quota</Tag>
                      </div>
                    )}
                  </div>
                ) : (
                  <Text type="secondary">Không lấy được thông tin quota</Text>
                )}
              </Card>
            )}
          </Space>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Manual Video Uploader">
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Video Title" name="title" rules={[{ required: true, whitespace: true }, { max: 100, message: 'Title must be at most 100 characters' }]}>
                    <Input placeholder="Enter video title" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Privacy Status" name="privacy" initialValue="private">
                    <Select>
                      <Select.Option value="public">Public</Select.Option>
                      <Select.Option value="unlisted">Unlisted</Select.Option>
                      <Select.Option value="private">Private</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
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
                  disabled={uploading}
                >
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined />
                  </p>
                  <p className="ant-upload-text">Click or drag file to this area to upload</p>
                  <p className="ant-upload-hint">Support for a single MP4, MOV upload.</p>
                </Dragger>
              </Form.Item>
              {uploading && (
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">
                    {uploadPhase === 'youtube' ? 'Đang đẩy video lên YouTube...' : 'Đang tải file lên server...'}
                  </Text>
                  <Progress percent={uploadPhase === 'youtube' ? 100 : progress} status="active" />
                </div>
              )}
              <Form.Item>
                <Tooltip title={!hasEnoughQuota ? "Đã hết quota API hôm nay, vui lòng thử lại vào ngày mai" : ""}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<UploadOutlined />} 
                    loading={uploading} 
                    disabled={!isConnected || !hasEnoughQuota}
                  >
                    Start Upload
                  </Button>
                </Tooltip>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={24}>
          <Card 
            title="Recent Uploads" 
            extra={<Button icon={<ReloadOutlined />} onClick={fetchRecentUploads} loading={loadingUploads} disabled={!isConnected} />}
          >
            <Table 
              columns={columns} 
              dataSource={recentUploads} 
              rowKey="id" 
              loading={loadingUploads}
              locale={{ emptyText: isConnected ? 'No videos found' : 'Connect to YouTube to see recent uploads' }}
            />
          </Card>
        </Col>
      </Row>

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
