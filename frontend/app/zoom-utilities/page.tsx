'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Typography, Form, Input, Select, Space, Switch, Alert, Badge, message, Descriptions, Spin, Divider } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import YoutubeTokenBanner from '../../components/YoutubeTokenBanner';
import { ZoomPageTitle } from '../../components/BrandLogos';
import ZoomRecordingsPanel from '../../components/ZoomRecordingsPanel';
import ZoomSyncRules from '../../components/ZoomSyncRules';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useT, useFormat } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { captionLanguageOptions, defaultCaptionTrackName } from '@/lib/captions';
import { trackEvent } from '@/lib/product-analytics';

const { Text } = Typography;

// IANA zones for {date}/{time} in the templates
const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Ho_Chi_Minh', 'UTC'];
  }
})();

export default function ZoomUtilities() {
  const t = useT();
  const fmt = useFormat();
  const { language } = usePreferences();
  const [workflowForm] = Form.useForm();
  const captionLanguage = Form.useWatch('captionLanguage', workflowForm) || 'vi';
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  // Filled by ZoomRecordingsPanel, which already loads the channel's playlists
  const [playlists, setPlaylists] = useState<any[]>([]);
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

  const fetchWorkflowSettings = async () => {
    setWorkflowLoading(true);
    try {
      const settings = await apiFetch('/zoom/workflow-settings');
      workflowForm.setFieldsValue({ ...settings, playlistId: settings.playlistId || 'none' });
    } catch (error: any) {
      message.error(t('zoomDash.loadWorkflowFailed'));
    } finally {
      setWorkflowLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchWorkflowSettings();
  }, []);

  const onUpdateSettings = async (values: any) => {
    setSavingWorkflow(true);
    try {
      const settings = await apiFetch('/zoom/workflow-settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...values,
          playlistId: values.playlistId === 'none' ? null : values.playlistId,
        }),
      });
      workflowForm.setFieldsValue({ ...settings, playlistId: settings.playlistId || 'none' });
      message.success(t('zoomDash.settingsSaved'));
      trackEvent('workflow_saved', {
        auto_upload: settings.autoUpload,
        has_description_template: !!settings.descriptionTemplate?.trim(),
        captions_enabled: settings.captionsEnabled,
      });
    } catch (error: any) {
      message.error(error.message || t('zoomDash.saveWorkflowFailed'));
    } finally {
      setSavingWorkflow(false);
    }
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
            {/* Spin rather than Card loading: the form must stay mounted for setFieldsValue */}
            <Spin spinning={workflowLoading}>
              <Form form={workflowForm} layout="vertical" onFinish={onUpdateSettings}>
                <Form.Item
                  label={t('zoomDash.autoUpload')}
                  name="autoUpload"
                  valuePropName="checked"
                  extra={t('zoomDash.autoUploadHelp')}
                >
                  <Switch />
                </Form.Item>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label={t('zoomDash.titleTemplate')}
                      name="titleTemplate"
                      rules={[{ required: true, whitespace: true }, { max: 200 }]}
                    >
                      <Input placeholder="Zoom Recording: {topic}" maxLength={200} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label={t('zoomDash.descriptionTemplate')} name="descriptionTemplate" rules={[{ max: 2000 }]}>
                      <Input.TextArea placeholder="Recorded on {date} {time}" autoSize={{ minRows: 1, maxRows: 6 }} maxLength={2000} />
                    </Form.Item>
                  </Col>
                </Row>
                <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 16 }}>
                  {t('zoomDash.placeholdersHelp')}
                </Text>

                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item label={t('zoomDash.defaultPrivacy')} name="privacyStatus">
                      <Select>
                        <Select.Option value="public">{t('privacy.public')}</Select.Option>
                        <Select.Option value="unlisted">{t('privacy.unlisted')}</Select.Option>
                        <Select.Option value="private">{t('privacy.private')}</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label={t('zoomDash.defaultPlaylist')} name="playlistId">
                      <Select showSearch optionFilterProp="label" options={[
                        { value: 'none', label: t('playlistPicker.none') },
                        ...playlists.map(p => ({ value: p.id, label: p.title })),
                      ]} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label={t('zoomDash.timeZone')} name="timeZone">
                      <Select showSearch options={TIME_ZONES.map(zone => ({ value: zone, label: zone }))} />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider titlePlacement="start" plain>{t('zoomDash.captionsSection')}</Divider>
                <Form.Item
                  label={t('zoomDash.captionsEnabled')}
                  name="captionsEnabled"
                  valuePropName="checked"
                  extra={t('zoomDash.captionsHelp')}
                >
                  <Switch />
                </Form.Item>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label={t('zoomDash.captionLanguage')} name="captionLanguage" extra={t('zoomDash.captionLanguageHelp')}>
                      <Select showSearch optionFilterProp="label" options={captionLanguageOptions(language, captionLanguage)} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label={t('zoomDash.captionName')} name="captionName" rules={[{ max: 100 }]}>
                      <Input
                        placeholder={t('zoomDash.captionNamePlaceholder', { name: defaultCaptionTrackName(captionLanguage) })}
                        maxLength={100}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={savingWorkflow}>{t('zoomDash.saveWorkflow')}</Button>
                </Form.Item>
              </Form>
            </Spin>
          </Card>
        </Col>

        <Col span={24}>
          <ZoomSyncRules playlists={playlists} />
        </Col>

        <Col span={24}>
          {/* Same panel as YouTube → Channel Content → Zoom Sync */}
          <ZoomRecordingsPanel onPlaylistsLoaded={setPlaylists} />
        </Col>
      </Row>
    </DashboardLayout>
  );
}
