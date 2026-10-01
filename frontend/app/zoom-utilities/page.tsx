'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Button, Typography, Form, Input, Select, Space, Switch, Alert, Badge, message, Descriptions, Spin, Divider, Modal } from 'antd';
import { ThunderboltOutlined, CloudOutlined, FolderOpenOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import YoutubeTokenBanner from '../../components/YoutubeTokenBanner';
import { ZoomPageTitle } from '../../components/BrandLogos';
import ZoomRecordingsPanel from '../../components/ZoomRecordingsPanel';
import ZoomSyncRules, { type ZoomSyncRulesHandle } from '../../components/ZoomSyncRules';
import ZoomUpcomingMeetings from '../../components/ZoomUpcomingMeetings';
import { FileExplorer } from '../../components/FileExplorer';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useT, useFormat } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { captionLanguageOptions, defaultCaptionTrackName } from '@/lib/captions';
import { DRIVE_FILE_TYPES, formatBytes } from '@/lib/drive-backup';
import { setPersonProperties, trackEvent } from '@/lib/product-analytics';

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
  const rulesRef = useRef<ZoomSyncRulesHandle>(null);
  // Saved settings or rules change what the upcoming meetings will get
  const [predictionKey, setPredictionKey] = useState(0);
  const refreshPredictions = () => setPredictionKey(key => key + 1);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });
  const driveBackupEnabled = Form.useWatch('driveBackupEnabled', workflowForm);
  const driveBackupTarget = Form.useWatch('driveBackupTarget', workflowForm);
  // Drive/OneDrive connection cards (from /connections)
  const [driveCard, setDriveCard] = useState<any>(null);
  const [onedriveCard, setOnedriveCard] = useState<any>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);

  const fetchCards = async () => {
    try {
      const list = await apiFetch('/connections');
      setDriveCard(list.find((c: any) => c.provider === 'google_drive') ?? null);
      setOnedriveCard(list.find((c: any) => c.provider === 'onedrive') ?? null);
    } catch {
      // The card just does not show its storage; the switch still saves
    }
  };

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
    fetchCards();
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
      refreshPredictions();
      trackEvent('workflow_saved', {
        auto_upload: settings.autoUpload,
        has_description_template: !!settings.descriptionTemplate?.trim(),
        captions_enabled: settings.captionsEnabled,
      });
      setPersonProperties({
        drive_backup_enabled: settings.driveBackupEnabled,
        drive_backup_target: settings.driveBackupTarget,
        drive_file_types: settings.driveFileTypes,
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

                <Divider titlePlacement="start" plain>{t('zoomDash.driveSection')}</Divider>
                {(driveCard?.connected || onedriveCard?.connected) ? (
                  <>
                    <Form.Item
                      label={t('zoomDash.driveBackupEnabled')}
                      name="driveBackupEnabled"
                      valuePropName="checked"
                      extra={t('zoomDash.driveBackupHelp')}
                    >
                      <Switch />
                    </Form.Item>
                    {driveBackupEnabled && (
                      <>
                        <Row gutter={16}>
                          <Col xs={24} md={12}>
                            <Form.Item label={t('zoomDash.driveTarget')} name="driveBackupTarget" extra={t('zoomDash.driveTargetHelp')}>
                              <Select options={[
                                { value: 'GOOGLE_DRIVE', label: 'Google Drive', disabled: !driveCard?.connected },
                                { value: 'ONEDRIVE', label: 'Microsoft OneDrive', disabled: !onedriveCard?.connected },
                              ]} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item label={t('zoomDash.driveFileTypes')} name="driveFileTypes" extra={t('zoomDash.driveFileTypesHelp')}>
                              <Select
                                mode="multiple"
                                options={DRIVE_FILE_TYPES.map(type => ({ value: type, label: t(`driveFile.${type}` as 'driveFile.MP4') }))}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={16}>
                          <Col xs={24} md={24}>
                            <Form.Item label={t('zoomDash.driveFolder')} extra={t('zoomDash.driveFolderHelp')}>
                              <Space.Compact style={{ width: '100%' }}>
                                <Form.Item name="driveFolderName" noStyle>
                                  <Input 
                                    readOnly 
                                    placeholder={t('zoomDash.driveFolderRoot')} 
                                    prefix={<FolderOpenOutlined />} 
                                  />
                                </Form.Item>
                                <Button 
                                  icon={<FolderOpenOutlined />} 
                                  onClick={() => setExplorerOpen(true)}
                                >
                                  {t('zoomDash.browse')}
                                </Button>
                              </Space.Compact>
                            </Form.Item>
                            <Form.Item name="driveFolderId" noStyle>
                              <Input type="hidden" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Space orientation="vertical" style={{ width: '100%', marginBottom: 16 }}>
                          {driveCard?.connected && (
                            <Text type="secondary" style={{ display: 'block' }}>
                              <Badge status="success" /> <strong>Google Drive:</strong> {driveCard.externalAccountId}
                              {driveCard.storage && (
                                <> · {driveCard.storage.limit
                                  ? t('zoomDash.driveStorage', { used: formatBytes(driveCard.storage.usage, fmt.locale), limit: formatBytes(driveCard.storage.limit, fmt.locale) })
                                  : t('zoomDash.driveStorageUnlimited', { used: formatBytes(driveCard.storage.usage, fmt.locale) })}</>
                              )}
                            </Text>
                          )}
                          {onedriveCard?.connected && (
                            <Text type="secondary" style={{ display: 'block' }}>
                              <Badge status="success" /> <strong>OneDrive:</strong> {onedriveCard.externalAccountId}
                              {onedriveCard.storage && (
                                <> · {t('zoomDash.driveStorage', { used: formatBytes(onedriveCard.storage.used, fmt.locale), limit: formatBytes(onedriveCard.storage.total, fmt.locale) })}</>
                              )}
                            </Text>
                          )}
                        </Space>
                      </>
                    )}
                  </>
                ) : (
                  <Alert
                    type="info"
                    showIcon
                    icon={<CloudOutlined />}
                    message={t('zoomDash.driveNotConnected')}
                    action={<Link href="/settings/integrations"><Button size="small">{t('zoomDash.driveConnect')}</Button></Link>}
                  />
                )}

                <Form.Item style={{ marginTop: 24 }}>
                  <Button type="primary" htmlType="submit" loading={savingWorkflow}>{t('zoomDash.saveWorkflow')}</Button>
                </Form.Item>
              </Form>
            </Spin>
          </Card>
        </Col>

        <Col span={24}>
          <ZoomSyncRules ref={rulesRef} playlists={playlists} onChanged={refreshPredictions} />
        </Col>

        <Col span={24}>
          {/* Same panel as YouTube → Channel Content → Zoom Sync */}
          <ZoomRecordingsPanel onPlaylistsLoaded={setPlaylists} />
        </Col>

        <Col span={24}>
          <ZoomUpcomingMeetings
            playlists={playlists}
            refreshKey={predictionKey}
            onOpenRule={(ruleId) => rulesRef.current?.openRule(ruleId)}
          />
        </Col>
      </Row>

      <Modal
        title={t('explorer.title')}
        open={explorerOpen}
        onCancel={() => setExplorerOpen(false)}
        width={1000}
        footer={null}
        destroyOnHidden
      >
        <FileExplorer 
          provider={driveBackupTarget === 'ONEDRIVE' ? 'onedrive' : 'google_drive'} 
          selectable
          onSelectFolder={(id, name) => {
            workflowForm.setFieldsValue({ driveFolderId: id, driveFolderName: name });
            setExplorerOpen(false);
          }}
        />
      </Modal>
    </DashboardLayout>
  );
}
