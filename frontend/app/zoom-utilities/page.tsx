'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Typography, Form, Input, Select, Space, Switch, Alert, Badge, message, Descriptions } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import YoutubeTokenBanner from '../../components/YoutubeTokenBanner';
import { ZoomPageTitle } from '../../components/BrandLogos';
import ZoomRecordingsPanel from '../../components/ZoomRecordingsPanel';
import { apiFetch } from '@/lib/api';

const { Text } = Typography;

export default function ZoomUtilities() {
  const [autoUpload, setAutoUpload] = useState(true);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });

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

  useEffect(() => {
    fetchConfigs();
  }, []);

  const onUpdateSettings = (values: any) => {
    message.success('Automation settings updated!');
  };

  return (
    <DashboardLayout>
      <div style={{ marginBottom: 16 }}>
        <ZoomPageTitle title="Dashboard" />
      </div>
      <YoutubeTokenBanner />

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
            <Form layout="vertical" initialValues={{ autoUpload: true, privacy: 'private', titleTemplate: '[Zoom] {topic} - {date}' }} onFinish={onUpdateSettings}>
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
          {/* Same panel as YouTube → Channel Content → Zoom Sync */}
          <ZoomRecordingsPanel />
        </Col>
      </Row>
    </DashboardLayout>
  );
}

// Dummy Link component since we are in one file
function Link({ children, ...props }: any) {
  return <a {...props}>{children}</a>;
}
