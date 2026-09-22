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

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const data = await apiFetch('/youtube/status');
      setStatus(data);
    } catch (error) {
      setStatus({ connected: false, reason: 'invalid_credentials' });
    } finally {
      setCheckingStatus(false);
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
      render: (url: string) => <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} />,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Public' ? 'green' : status === 'Unlisted' ? 'blue' : 'orange'}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Upload Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Actions',
      key: 'action',
      render: () => (
        <Space size="middle">
          <Button icon={<LinkOutlined />} size="small">View</Button>
        </Space>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      thumbnail: 'https://via.placeholder.com/120x90?text=Zoom+Rec',
      title: '[Zoom] Weekly Sync - 2024-05-20',
      status: 'Unlisted',
      date: '2024-05-20 10:30',
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
                  <Form.Item label="Privacy Status" name="privacy" initialValue="unlisted">
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
          <Card title="Recent Uploads">
            <Table columns={columns} dataSource={data} />
          </Card>
        </Col>
      </Row>
    </DashboardLayout>
  );
}
