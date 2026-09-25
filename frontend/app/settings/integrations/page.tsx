'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Card, Row, Col, Typography, Form, Input, Button, Tabs, Space, Switch, Divider, message, Spin, Alert, Avatar, Tag, Tooltip } from 'antd';
import { SettingOutlined, LockOutlined, GoogleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '../../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { AUTH_RETURN_TO_KEY } from '../../../components/YoutubeTokenBanner';
import { YoutubeLogo, ZoomLogo } from '../../../components/BrandLogos';
import { useT, useTNode } from '@/lib/i18n';

const { Title, Text } = Typography;

// Send a secret only when the user typed one; empty means "keep the saved value"
function withoutEmptySecrets(values: Record<string, any>, secretFields: string[]) {
  const result = { ...values };
  for (const field of secretFields) {
    if (!result[field]) delete result[field];
  }
  return result;
}

function IntegrationsContent() {
  const t = useT();
  const tNode = useTNode();
  const [configsLoading, setConfigsLoading] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });
  const [youtubeStatus, setYoutubeStatus] = useState<any>(null);
  const [checkingYoutube, setCheckingYoutube] = useState(false);
  const [zoomForm] = Form.useForm();
  const [youtubeForm] = Form.useForm();
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleCallback = async (code: string) => {
    try {
      setAuthorizing(true);
      await apiFetch('/youtube/callback', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      message.success(t('integ.ytAuthSuccess'));
      // Re-authorize started from another page (e.g. YouTube Utilities): go back there
      let returnTo: string | null = null;
      try {
        returnTo = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      } catch {
        // Storage unavailable: stay on Integrations
      }
      if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        router.replace(returnTo);
        return;
      }
      // Clean up URL
      router.replace('/settings/integrations?tab=youtube');
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || t('integ.ytAuthFailed'));
    } finally {
      setAuthorizing(false);
    }
  };

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      handleCallback(code);
    }
  }, [searchParams]);

  const fetchConfigs = async () => {
    setConfigsLoading(true);
    try {
      const response = await apiFetch('/integrations/config');
      setConfigs(response);
      // Secrets are never sent back: their inputs start empty (placeholder says whether one is saved)
      zoomForm.setFieldsValue({ ...response.zoom, clientSecret: '', webhookSecretToken: '' });
      youtubeForm.setFieldsValue({ ...response.youtube, clientSecret: '', refreshToken: '' });
      
      // Also fetch YouTube status
      fetchYoutubeStatus();
    } catch (error: any) {
      message.error(t('zoomDash.loadConfigFailed'));
    } finally {
      setConfigsLoading(false);
    }
  };

  // Connection + channel status (channels.list): verify state, channel info
  const fetchYoutubeStatus = async () => {
    setCheckingYoutube(true);
    try {
      const status = await apiFetch('/youtube/status');
      setYoutubeStatus(status);
    } catch (error) {
      console.error('Failed to fetch YouTube status', error);
    } finally {
      setCheckingYoutube(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const onUpdateZoom = async (values: any) => {
    try {
      await apiFetch('/integrations/zoom', {
        method: 'PATCH',
        body: JSON.stringify(withoutEmptySecrets(values, ['clientSecret', 'webhookSecretToken'])),
      });
      message.success(t('integ.zoomSaved'));
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || t('integ.zoomSaveFailed'));
    }
  };

  const onUpdateYoutube = async (values: any) => {
    try {
      await apiFetch('/integrations/youtube', {
        method: 'PATCH',
        body: JSON.stringify(withoutEmptySecrets(values, ['clientSecret', 'refreshToken'])),
      });
      message.success(t('integ.ytSaved'));
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || t('integ.ytSaveFailed'));
    }
  };

  const zoomTabContent = (
    <>
      <Form 
        form={zoomForm} 
        layout="vertical" 
        onFinish={onUpdateZoom}
      >
        <Form.Item label={t('integ.activation')} name="isActive" valuePropName="checked">
          <Switch checkedChildren={t('integ.active')} unCheckedChildren={t('integ.inactive')} />
        </Form.Item>
        <Form.Item label="Account ID" name="accountId">
          <Input prefix={<LockOutlined />} placeholder="Zoom Account ID" />
        </Form.Item>
        <Form.Item label="Client ID" name="clientId">
          <Input prefix={<LockOutlined />} placeholder="Zoom Client ID" />
        </Form.Item>
        <Form.Item label="Client Secret" name="clientSecret">
          <Input.Password prefix={<LockOutlined />} placeholder={configs.zoom?.hasClientSecret ? t('integ.secretSaved') : 'Zoom Client Secret'} />
        </Form.Item>
        <Form.Item label="Webhook Secret Token" name="webhookSecretToken">
          <Input.Password prefix={<LockOutlined />} placeholder={configs.zoom?.hasWebhookSecretToken ? t('integ.secretSaved') : 'Zoom Webhook Secret Token'} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">{t('integ.saveZoom')}</Button>
        </Form.Item>
      </Form>
      
      <Divider />
      
      <Text type="secondary">
        <strong>{t('integ.webhookEndpoint')}</strong><br/>
        <code>https://api.n3-utils.com/api/zoom/webhook</code>
      </Text>
    </>
  );

  const onAuthorizeYoutube = async () => {
    try {
      const { url } = await apiFetch('/youtube/auth-url');
      window.location.href = url;
    } catch (error: any) {
      message.error(error.message || t('integ.authUrlFailed'));
    }
  };

  const youtubeTabContent = (
    <>
      {authorizing && (
        <Alert
          title={t('integ.authorizingTitle')}
          description={t('integ.authorizingDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {youtubeStatus && (
        <Alert
          title={youtubeStatus.connected ? t('integ.ytConnected') : t('integ.ytNotConnected')}
          description={
            youtubeStatus.connected ? (
              <div>
                <Space align="center" style={{ marginTop: 4 }}>
                  {youtubeStatus.channelThumbnail && <Avatar size={32} src={youtubeStatus.channelThumbnail} />}
                  <span>{tNode('integ.connectedChannel', { channel: <strong>{youtubeStatus.channelTitle}</strong> })}</span>
                </Space>
                <div style={{ marginTop: 8 }}>
                  {youtubeStatus.longUploadsStatus === 'allowed' ? (
                    <Tag color="success">{t('integ.verified')}</Tag>
                  ) : (
                    <Tooltip title={t('integ.notVerifiedHint')}>
                      <Tag color="warning" style={{ cursor: 'help' }}>{t('integ.notVerified')}</Tag>
                    </Tooltip>
                  )}
                  <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    {t('integ.verifyHere')}
                  </a>
                </div>
              </div>
            ) : youtubeStatus.reason === 'not_configured'
              ? t('integ.reasonNotConfigured')
              : youtubeStatus.reason === 'token_expired'
                ? t('integ.reasonTokenExpired')
                : t('integ.reasonInvalid')
          }
          type={youtubeStatus.connected ? "success" : "warning"}
          showIcon
          action={
            <Space orientation="vertical" align="end">
              <Button size="small" icon={<ReloadOutlined />} onClick={fetchYoutubeStatus} loading={checkingYoutube}>
                {t('integ.recheck')}
              </Button>
              {youtubeStatus.reason !== 'not_configured' && (
                <Button
                  size="small"
                  type={youtubeStatus.connected ? 'default' : 'primary'}
                  icon={<GoogleOutlined />}
                  onClick={onAuthorizeYoutube}
                >
                  {t('integ.reauthorize')}
                </Button>
              )}
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Form 
        form={youtubeForm} 
        layout="vertical" 
        onFinish={onUpdateYoutube}
      >
        <Form.Item label={t('integ.activation')} name="isActive" valuePropName="checked">
          <Switch checkedChildren={t('integ.active')} unCheckedChildren={t('integ.inactive')} />
        </Form.Item>
        <Form.Item label="Client ID" name="clientId">
          <Input prefix={<LockOutlined />} placeholder="Google Client ID" />
        </Form.Item>
        <Form.Item label="Client Secret" name="clientSecret">
          <Input.Password prefix={<LockOutlined />} placeholder={configs.youtube?.hasClientSecret ? t('integ.secretSaved') : 'Google Client Secret'} />
        </Form.Item>
        <Form.Item label="Refresh Token" name="refreshToken" help={t('integ.refreshTokenHelp')}>
          <Input.Password prefix={<LockOutlined />} placeholder={configs.youtube?.hasRefreshToken ? t('integ.secretSaved') : 'Google OAuth Refresh Token'} />
        </Form.Item>
        <Form.Item>
          <Space wrap>
            <Button type="primary" htmlType="submit">{t('integ.saveYoutube')}</Button>
            <Button 
              icon={<GoogleOutlined />} 
              onClick={onAuthorizeYoutube}
              disabled={!configs.youtube?.clientId || !configs.youtube?.hasClientSecret || youtubeStatus?.connected}
            >
              {youtubeStatus?.connected ? t('integ.ytAuthorized') : t('integ.authorizeYoutube')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </>
  );

  const items = [
    {
      key: 'youtube',
      // Official logos (they already spell the names; alt text keeps the tab labels readable)
      label: <YoutubeLogo height={18} />,
      children: youtubeTabContent,
      forceRender: true,
    },
    {
      key: 'zoom',
      label: <ZoomLogo height={14} />,
      children: zoomTabContent,
      forceRender: true,
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Title level={2}>
        <Space>
          <SettingOutlined />
          <span>{t('integ.title')}</span>
        </Space>
      </Title>
      <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>
        {t('integ.subtitle')}
      </Text>

      <Card loading={configsLoading}>
        <Tabs 
          activeKey={searchParams.get('tab') || 'youtube'} 
          onChange={(key) => router.push(`/settings/integrations?tab=${key}`)}
          items={items} 
        />
      </Card>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<Card loading={true} />}>
        <IntegrationsContent />
      </Suspense>
    </DashboardLayout>
  );
}
