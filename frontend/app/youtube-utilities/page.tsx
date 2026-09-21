'use client';

import React, { useState } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Upload, Form, Input, Select, Table, Space, Progress, message } from 'antd';
import { YoutubeOutlined, UploadOutlined, LinkOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';

const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function YoutubeUtilities() {
  const [isConnected, setIsConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const handleConnect = () => {
    message.loading('Connecting to Google...', 1.5).then(() => {
      setIsConnected(true);
      message.success('Connected to YouTube Channel: N3 Official');
    });
  };

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
              {isConnected ? (
                <>
                  <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                  <Title level={4}>Connected</Title>
                  <Text type="secondary">Account: n3-admin@gmail.com</Text>
                  <div style={{ marginTop: 20 }}>
                    <Button icon={<SyncOutlined />} style={{ marginRight: 8 }}>Refresh Token</Button>
                    <Button danger onClick={() => setIsConnected(false)}>Disconnect</Button>
                  </div>
                </>
              ) : (
                <>
                  <YoutubeOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                  <Title level={4}>Not Connected</Title>
                  <Text type="secondary">Link your YouTube account to start uploading</Text>
                  <div style={{ marginTop: 20 }}>
                    <Button type="primary" danger icon={<YoutubeOutlined />} onClick={handleConnect}>
                      Connect YouTube
                    </Button>
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
