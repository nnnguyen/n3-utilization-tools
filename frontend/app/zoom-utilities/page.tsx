'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Tag, Typography, Form, Input, Select, Table, Space, Switch, Alert, List, Badge, message, Spin, Divider, DatePicker, Modal, Descriptions } from 'antd';
import { VideoCameraOutlined, HistoryOutlined, YoutubeOutlined, ThunderboltOutlined, ReloadOutlined, FilePdfOutlined, AudioOutlined, MessageOutlined, PlayCircleOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

export default function ZoomUtilities() {
  const [autoUpload, setAutoUpload] = useState(true);
  const [recordings, setRecordings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });
  
  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecordings, setTotalRecordings] = useState(0);
  const [dateFilter, setDateFilter] = useState<string>('7');
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string>('');

  // Details Modal
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<any>(null);

  // Most Recent Recording (from Webhook)
  const [mostRecentRecording, setMostRecentRecording] = useState<any>(null);

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

  useEffect(() => {
    const init = async () => {
      await fetchConfigs();
      await fetchRecordings();
      await fetchLogs();
    };
    init();
  }, [dateFilter, customDateRange]);

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
      title: 'Action',
      key: 'action',
      render: (record: any) => (
        <Space>
          <Button 
            type="primary" 
            size="small"
            onClick={() => {
              setSelectedRecording(record);
              setDetailsVisible(true);
            }}
          >
            See details
          </Button>
          <Button 
            icon={<YoutubeOutlined />} 
            size="small"
            onClick={() => message.info(`Manual sync triggered for: ${record.topic}`)}
          >
            Sync
          </Button>
        </Space>
      ),
    },
  ];

  const columns = [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'time',
      render: (text: string) => text ? new Date(text).toLocaleString() : '-',
    },
    {
      title: 'Meeting',
      dataIndex: 'meeting',
      key: 'meeting',
    },
    {
      title: 'YouTube Link',
      dataIndex: 'youtubeId',
      key: 'youtubeId',
      render: (id: string) => id ? <Link href={`https://youtu.be/${id}`} target="_blank" style={{ color: '#1890ff' }}>View on YouTube</Link> : '-',
    },
  ];

  const onUpdateSettings = (values: any) => {
    message.success('Automation settings updated!');
  };

  return (
    <DashboardLayout>
      <Title level={2}>Zoom Utilities</Title>

      {!configs.zoom?.isActive && !configsLoading && (
        <Alert
          title="Zoom Integration Inactive"
          description={
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Text>Please configure and activate your Zoom API credentials to view and sync recordings.</Text>
              <Link href="/integrations">
                <Button type="primary" size="small">Activate now</Button>
              </Link>
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col span={24}>
          {configs.zoom?.isActive && (
            <Alert
                title="Zoom Webhook Active"
                description="The system is successfully receiving events from Zoom App Marketplace."
                type="success"
                showIcon
                closable
                style={{ marginBottom: 16 }}
            />
          )}
        </Col>

        {mostRecentRecording && (
          <Col span={24}>
            <Card title={<Space><ThunderboltOutlined /><span>Most Recent Recording</span></Space>}>
              <Descriptions column={3}>
                <Descriptions.Item label="Topic">{mostRecentRecording.topic}</Descriptions.Item>
                <Descriptions.Item label="Start Time">{new Date(mostRecentRecording.start_time).toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="Duration">{mostRecentRecording.duration} min</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16 }}>
                <Badge status="processing" text="New recording detected via webhook" />
              </div>
            </Card>
          </Col>
        )}

        <Col xs={24} lg={24}>
          <Card title={<Space><ThunderboltOutlined /><span>Automation Workflow Manager</span></Space>}>
            <Form layout="vertical" initialValues={{ autoUpload: true, privacy: 'unlisted', titleTemplate: '[Zoom] {topic} - {date}' }} onFinish={onUpdateSettings}>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item label="Auto-upload to YouTube" name="autoUpload" valuePropName="checked">
                    <Switch checked={autoUpload} onChange={setAutoUpload} />
                  </Form.Item>
                </Col>
                
                <Col xs={24} md={8}>
                  <Form.Item label="Default YouTube Title Template" name="titleTemplate">
                    <Input placeholder="[Zoom] {topic} - {date}" disabled={!autoUpload} />
                  </Form.Item>
                </Col>

                <Col xs={24} md={8}>
                  <Form.Item label="Default Privacy Status" name="privacy">
                    <Select disabled={!autoUpload}>
                      <Select.Option value="public">Public</Select.Option>
                      <Select.Option value="unlisted">Unlisted</Select.Option>
                      <Select.Option value="private">Private</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit">Save Workflow Settings</Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={24}>
          <Card 
            title={<Space><VideoCameraOutlined /><span>Cloud Recordings</span></Space>}
            extra={
              <Space>
                <Select value={dateFilter} onChange={setDateFilter} style={{ width: 150 }}>
                  <Select.Option value="7">Last 7 days</Select.Option>
                  <Select.Option value="14">Last 14 days</Select.Option>
                  <Select.Option value="30">Last 30 days</Select.Option>
                  <Select.Option value="custom">Custom Range</Select.Option>
                </Select>
                {dateFilter === 'custom' && (
                  <RangePicker 
                    onChange={(dates) => setCustomDateRange(dates as any)}
                  />
                )}
                <Button icon={<ReloadOutlined />} onClick={() => fetchRecordings()} loading={loading}>Refresh</Button>
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
                  // Zoom API uses tokens, but for simplicity we'll just refetch
                  // or we'd need to handle token sequence. 
                  // If we don't have total_records from Zoom easily, 
                  // we might just do "Next Page" button.
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
        </Col>

        <Col span={24}>
          <Card 
            title={<Space><HistoryOutlined /><span>Recording Sync Logs</span></Space>}
            extra={<Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={logsLoading}>Refresh</Button>}
          >
            <Table columns={columns} dataSource={logs} rowKey="id" loading={logsLoading} />
          </Card>
        </Col>
      </Row>

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
    </DashboardLayout>
  );
}

// Dummy Link component since we are in one file
function Link({ children, ...props }: any) {
  return <a {...props}>{children}</a>;
}
