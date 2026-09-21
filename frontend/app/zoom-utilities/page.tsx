'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Form, Input, Select, Table, Space, Switch, Alert, List, Badge, message, Spin } from 'antd';
import { VideoCameraOutlined, SettingOutlined, HistoryOutlined, YoutubeOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';

const { Title, Text, Paragraph } = Typography;

export default function ZoomUtilities() {
  const [autoUpload, setAutoUpload] = useState(true);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/zoom/recordings');
      setRecordings(response.meetings || []);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      message.error('Failed to fetch Zoom recordings. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const logs = [
    {
      id: '1',
      event: 'Recording Completed',
      meeting: 'Weekly Sync',
      time: '2024-05-20 10:30:05',
      status: 'Success',
      youtubeId: 'dQw4w9WgXcQ',
    },
    {
      id: '2',
      event: 'Recording Completed',
      meeting: 'Client Interview',
      time: '2024-05-19 14:20:10',
      status: 'Processing',
      youtubeId: null,
    },
    {
      id: '3',
      event: 'URL Validation',
      meeting: 'System',
      time: '2024-05-18 09:00:00',
      status: 'Verified',
      youtubeId: null,
    }
  ];

  const recordingColumns = [
    {
      title: 'Topic',
      dataIndex: 'topic',
      key: 'topic',
    },
    {
      title: 'Start Time',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Duration (min)',
      dataIndex: 'duration',
      key: 'duration',
    },
    {
      title: 'Files',
      dataIndex: 'recording_files',
      key: 'files',
      render: (files: any[]) => (
        <Space direction="vertical">
          {files.map((file, idx) => (
            <Tag key={idx} color={file.file_type === 'MP4' ? 'blue' : 'default'}>
              {file.file_type} ({Math.round(file.file_size / 1024 / 1024)} MB)
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (record: any) => (
        <Button 
          icon={<YoutubeOutlined />} 
          type="primary" 
          size="small"
          onClick={() => message.info(`Manual sync triggered for: ${record.topic}`)}
        >
          Sync to YouTube
        </Button>
      ),
    },
  ];

  const columns = [
    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
    },
    {
      title: 'Event',
      dataIndex: 'event',
      key: 'event',
    },
    {
      title: 'Meeting',
      dataIndex: 'meeting',
      key: 'meeting',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'blue';
        if (status === 'Success') color = 'green';
        if (status === 'Verified') color = 'purple';
        if (status === 'Processing') color = 'orange';
        return <Badge status={color as any} text={status} />;
      }
    },
    {
      title: 'YouTube ID',
      dataIndex: 'youtubeId',
      key: 'youtubeId',
      render: (id: string) => id ? <Link href={`https://youtu.be/${id}`} target="_blank" style={{ color: '#1890ff' }}>{id}</Link> : '-',
    },
    {
      title: 'Action',
      key: 'action',
      render: (record: any) => (
        <Space size="middle">
          {record.status !== 'Success' && record.status !== 'Verified' && (
            <Button size="small" type="primary" ghost>Retry</Button>
          )}
        </Space>
      ),
    },
  ];

  const onUpdateSettings = (values: any) => {
    message.success('Automation settings updated!');
  };

  return (
    <DashboardLayout>
      <Title level={2}>Zoom Utilities</Title>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Alert
            message="Zoom Webhook Active"
            description="The system is successfully receiving events from Zoom App Marketplace."
            type="success"
            showIcon
            closable
            style={{ marginBottom: 16 }}
          />
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<Space><ThunderboltOutlined /><span>Automation Workflow Manager</span></Space>}>
            <Form layout="vertical" initialValues={{ autoUpload: true, privacy: 'unlisted', titleTemplate: '[Zoom] {topic} - {date}' }} onFinish={onUpdateSettings}>
              <Form.Item label="Auto-upload to YouTube" name="autoUpload" valuePropName="checked">
                <Switch checked={autoUpload} onChange={setAutoUpload} />
              </Form.Item>
              
              <Form.Item label="Default YouTube Title Template" name="titleTemplate">
                <Input placeholder="[Zoom] {topic} - {date}" disabled={!autoUpload} />
              </Form.Item>

              <Form.Item label="Default Privacy Status" name="privacy">
                <Select disabled={!autoUpload}>
                  <Select.Option value="public">Public</Select.Option>
                  <Select.Option value="unlisted">Unlisted</Select.Option>
                  <Select.Option value="private">Private</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit">Save Workflow Settings</Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<Space><SettingOutlined /><span>Configuration & Setup</span></Space>}>
            <Paragraph>
              To update your Zoom Webhook configuration, ensure your backend <code>ZOOM_WEBHOOK_SECRET_TOKEN</code> matches the one in Zoom Marketplace.
            </Paragraph>
            <Form layout="vertical">
              <Form.Item label="Webhook Endpoint URL">
                <Input value="https://api.n3-utils.com/api/zoom/webhook" readOnly addonAfter={<Button type="text" size="small">Copy</Button>} />
              </Form.Item>
              <Form.Item label="Verification Status">
                <Tag color="green">VERIFIED</Tag>
              </Form.Item>
              <Button icon={<HistoryOutlined />}>View Marketplace Docs</Button>
            </Form>
          </Card>
        </Col>

        <Col span={24}>
          <Card 
            title={<Space><VideoCameraOutlined /><span>Cloud Recordings</span></Space>}
            extra={<Button icon={<ReloadOutlined />} onClick={fetchRecordings} loading={loading}>Refresh</Button>}
          >
            <Table 
              columns={recordingColumns} 
              dataSource={recordings} 
              rowKey="id" 
              loading={loading}
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<Space><HistoryOutlined /><span>Recording Sync Logs</span></Space>}>
            <Table columns={columns} dataSource={logs} rowKey="id" />
          </Card>
        </Col>
      </Row>
    </DashboardLayout>
  );
}

// Dummy Link component since we are in one file
function Link({ children, ...props }: any) {
  return <a {...props}>{children}</a>;
}
