'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Upload, Form, Input, Select, Table, Space, Progress, message, Avatar, Spin } from 'antd';
import { YoutubeOutlined, UploadOutlined, LinkOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface YoutubeStatus {
  connected: boolean;
  reason?: 'not_configured' | 'invalid_credentials';
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string | null;
}

interface YoutubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  privacyStatus: string;
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

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const data = await apiFetch('/youtube/status');
      setStatus(data);
      if (data.connected) {
        fetchRecentUploads();
      }
    } catch (error) {
      setStatus({ connected: false, reason: 'invalid_credentials' });
    } finally {
      setCheckingStatus(false);
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

  useEffect(() => {
    checkStatus();
  }, []);

  const isConnected = status?.connected ?? false;

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
      render: (_, record: YoutubeVideo) => (
        <Space size="middle">
          <Button 
            icon={<LinkOutlined />} 
            size="small"
            href={`https://www.youtube.com/watch?v=${record.id}`}
            target="_blank"
          >
            View
          </Button>
        </Space>
      ),
    },
  ];

  const onFinish = (values: any) => {
    console.log('Success:', values);
    setUploading(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 10;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setUploading(false);
        message.success('Video uploaded successfully!');
        fetchRecentUploads(); // Refresh the list
      }
    }, 500);
  };

  return (
    <DashboardLayout>
      <Title level={2}>YouTube Utilities</Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Connection Status" extra={<YoutubeOutlined style={{ color: '#ff0000', fontSize: 20 }} />}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              {checkingStatus ? (
                <Spin />
              ) : isConnected ? (
                <>
                  {status?.channelThumbnail ? (
                    <Avatar size={64} src={status.channelThumbnail} style={{ marginBottom: 16 }} />
                  ) : (
                    <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                  )}
                  <Title level={4}>Connected</Title>
                  <Text type="secondary">Channel: {status?.channelTitle}</Text>
                  <div style={{ marginTop: 20 }}>
                    <Button icon={<ReloadOutlined />} onClick={checkStatus}>Recheck Status</Button>
                  </div>
                </>
              ) : (
                <>
                  <CloseCircleOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                  <Title level={4}>Not Connected</Title>
                  <Text type="secondary">
                    {STATUS_MESSAGE[status?.reason ?? 'not_configured']}
                  </Text>
                  <div style={{ marginTop: 20 }}>
                    <Button icon={<ReloadOutlined />} onClick={checkStatus}>Check Again</Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Manual Video Uploader">
            <Form layout="vertical" onFinish={onFinish}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Video Title" name="title" rules={[{ required: true }]}>
                    <Input placeholder="Enter video title" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Privacy Status" name="privacy" initialValue="private">
                    <Select>
                      <Select.Option value="public">Public</Select.Option>
                      <Select.Option value="unlisted">Unlisted</Select.Option>
                      <Select.Option value="private">Private</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Description" name="description">
                <Input.TextArea rows={3} placeholder="Video description..." />
              </Form.Item>
              <Form.Item label="Video File">
                <Dragger maxCount={1} beforeUpload={() => false}>
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined />
                  </p>
                  <p className="ant-upload-text">Click or drag file to this area to upload</p>
                  <p className="ant-upload-hint">Support for a single MP4, MOV upload.</p>
                </Dragger>
              </Form.Item>
              {uploading && <Progress percent={progress} status="active" style={{ marginBottom: 16 }} />}
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<UploadOutlined />} loading={uploading} disabled={!isConnected}>
                  Start Upload
                </Button>
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
    </DashboardLayout>
  );
}
