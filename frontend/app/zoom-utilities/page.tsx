'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Typography, Form, Input, Select, Space, Switch, Alert, Badge, message, Descriptions } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import YoutubeTokenBanner from '../../components/YoutubeTokenBanner';
import { ZoomPageTitle } from '../../components/BrandLogos';
import ZoomRecordingsPanel from '../../components/ZoomRecordingsPanel';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useT, useFormat } from '@/lib/i18n';

const { Text } = Typography;

export default function ZoomUtilities() {
  const t = useT();
  const fmt = useFormat();
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
      message.error(t('zoomDash.loadConfigFailed'));
    } finally {
      setConfigsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const onUpdateSettings = (values: any) => {
    message.success(t('zoomDash.settingsSaved'));
  };

  return (
    <DashboardLayout>
      <div style={{ marginBottom: 16 }}>
        <ZoomPageTitle title={t('nav.dashboard')} />
      </div>
      <YoutubeTokenBanner />

      {!configs.zoom?.isActive && !configsLoading && (
        <Alert
          title={t('zoomDash.inactiveTitle')}
          description={
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Text>{t('zoomDash.inactiveDesc')}</Text>
              <Link href="/settings/integrations">
                <Button type="primary" size="small">{t('zoomDash.activateNow')}</Button>
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
                title={t('zoomDash.webhookActiveTitle')}
                description={t('zoomDash.webhookActiveDesc')}
                type="success"
                showIcon
                closable
                style={{ marginBottom: 16 }}
            />
          )}
        </Col>

        {mostRecentRecording && (
          <Col span={24}>
            <Card title={<Space><ThunderboltOutlined /><span>{t('zoomDash.mostRecent')}</span></Space>}>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label={t('zoomDash.topic')}>{mostRecentRecording.topic}</Descriptions.Item>
                <Descriptions.Item label={t('zoomDash.startTime')}>{fmt.dateTime(mostRecentRecording.start_time)}</Descriptions.Item>
                <Descriptions.Item label={t('zoomDash.duration')}>{t('zoomDash.minutes', { count: mostRecentRecording.duration })}</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16 }}>
                <Badge status="processing" text={t('zoomDash.newRecordingDetected')} />
              </div>
            </Card>
          </Col>
        )}

        <Col xs={24} lg={24}>
          <Card title={<Space><ThunderboltOutlined /><span>{t('zoomDash.workflowTitle')}</span></Space>}>
            <Form layout="vertical" initialValues={{ autoUpload: true, privacy: 'private', titleTemplate: '[Zoom] {topic} - {date}' }} onFinish={onUpdateSettings}>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item label={t('zoomDash.autoUpload')} name="autoUpload" valuePropName="checked">
                    <Switch checked={autoUpload} onChange={setAutoUpload} />
                  </Form.Item>
                </Col>
                
                <Col xs={24} md={8}>
                  <Form.Item label={t('zoomDash.titleTemplate')} name="titleTemplate">
                    <Input placeholder="[Zoom] {topic} - {date}" disabled={!autoUpload} />
                  </Form.Item>
                </Col>

                <Col xs={24} md={8}>
                  <Form.Item label={t('zoomDash.defaultPrivacy')} name="privacy">
                    <Select disabled={!autoUpload}>
                      <Select.Option value="public">{t('privacy.public')}</Select.Option>
                      <Select.Option value="unlisted">{t('privacy.unlisted')}</Select.Option>
                      <Select.Option value="private">{t('privacy.private')}</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit">{t('zoomDash.saveWorkflow')}</Button>
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
