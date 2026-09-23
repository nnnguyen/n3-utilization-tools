'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Card, Row, Col, Typography, Form, Input, Button, Tabs, Space, Switch, Divider, message, Spin, Alert, Avatar, Tag, Tooltip } from 'antd';
import { SettingOutlined, VideoCameraOutlined, YoutubeOutlined, LockOutlined, GoogleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { AUTH_RETURN_TO_KEY } from '../../components/YoutubeTokenBanner';

const { Title, Text } = Typography;

function IntegrationsContent() {
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
      message.success('YouTube authorization successful!');
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
      router.replace('/integrations?tab=youtube');
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || 'YouTube authorization failed');
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
      zoomForm.setFieldsValue(response.zoom);
      youtubeForm.setFieldsValue(response.youtube);
      
      // Also fetch YouTube status
      fetchYoutubeStatus();
    } catch (error: any) {
      message.error('Failed to load integration settings');
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
        body: JSON.stringify(values),
      });
      message.success('Zoom credentials updated!');
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || 'Failed to update Zoom credentials');
    }
  };

  const onUpdateYoutube = async (values: any) => {
    try {
      await apiFetch('/integrations/youtube', {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      message.success('YouTube credentials updated!');
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || 'Failed to update YouTube credentials');
    }
  };

  const zoomTabContent = (
    <>
      <Form 
        form={zoomForm} 
        layout="vertical" 
        onFinish={onUpdateZoom}
        initialValues={configs.zoom}
      >
        <Form.Item label="Activation" name="isActive" valuePropName="checked">
          <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
        </Form.Item>
        <Form.Item label="Account ID" name="accountId">
          <Input prefix={<LockOutlined />} placeholder="Zoom Account ID" />
        </Form.Item>
        <Form.Item label="Client ID" name="clientId">
          <Input prefix={<LockOutlined />} placeholder="Zoom Client ID" />
        </Form.Item>
        <Form.Item label="Client Secret" name="clientSecret">
          <Input.Password prefix={<LockOutlined />} placeholder="Zoom Client Secret" />
        </Form.Item>
        <Form.Item label="Webhook Secret Token" name="webhookSecretToken">
          <Input.Password prefix={<LockOutlined />} placeholder="Zoom Webhook Secret Token" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">Save Zoom Config</Button>
        </Form.Item>
      </Form>
      
      <Divider />
      
      <Text type="secondary">
        <strong>Webhook Endpoint:</strong><br/>
        <code>https://api.n3-utils.com/api/zoom/webhook</code>
      </Text>
    </>
  );

  const onAuthorizeYoutube = async () => {
    try {
      const { url } = await apiFetch('/youtube/auth-url');
      window.location.href = url;
    } catch (error: any) {
      message.error(error.message || 'Failed to get authorization URL');
    }
  };

  const youtubeTabContent = (
    <>
      {authorizing && (
        <Alert
          title="Authorizing YouTube..."
          description="Please wait while we complete the connection."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {youtubeStatus && (
        <Alert
          title={youtubeStatus.connected ? "YouTube Connected" : "YouTube Not Connected"}
          description={
            youtubeStatus.connected ? (
              <div>
                <Space align="center" style={{ marginTop: 4 }}>
                  {youtubeStatus.channelThumbnail && <Avatar size={32} src={youtubeStatus.channelThumbnail} />}
                  <span>Connected to channel: <strong>{youtubeStatus.channelTitle}</strong></span>
                </Space>
                <div style={{ marginTop: 8 }}>
                  {youtubeStatus.longUploadsStatus === 'allowed' ? (
                    <Tag color="success">Verified — Video &gt;15m OK</Tag>
                  ) : (
                    <Tooltip title="Channel chưa verify số điện thoại sẽ bị giới hạn video dưới 15 phút.">
                      <Tag color="warning" style={{ cursor: 'help' }}>Chưa verify — giới hạn video &lt; 15m</Tag>
                    </Tooltip>
                  )}
                  <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Xác minh tại đây
                  </a>
                </div>
              </div>
            ) : youtubeStatus.reason === 'not_configured'
              ? "Please provide Client ID and Client Secret, then Authorize YouTube."
              : youtubeStatus.reason === 'token_expired'
                ? "Token xác thực YouTube đã hết hạn hoặc bị thu hồi. Bấm Re-authorize để kết nối lại."
                : "Invalid or expired credentials. Please re-authorize."
          }
          type={youtubeStatus.connected ? "success" : "warning"}
          showIcon
          action={
            <Space orientation="vertical" align="end">
              <Button size="small" icon={<ReloadOutlined />} onClick={fetchYoutubeStatus} loading={checkingYoutube}>
                Recheck Status
              </Button>
              {youtubeStatus.reason !== 'not_configured' && (
                <Button
                  size="small"
                  type={youtubeStatus.connected ? 'default' : 'primary'}
                  icon={<GoogleOutlined />}
                  onClick={onAuthorizeYoutube}
                >
                  Re-authorize
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
        initialValues={configs.youtube}
      >
        <Form.Item label="Activation" name="isActive" valuePropName="checked">
          <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
        </Form.Item>
        <Form.Item label="Client ID" name="clientId">
          <Input prefix={<LockOutlined />} placeholder="Google Client ID" />
        </Form.Item>
        <Form.Item label="Client Secret" name="clientSecret">
          <Input.Password prefix={<LockOutlined />} placeholder="Google Client Secret" />
        </Form.Item>
        <Form.Item label="Refresh Token" name="refreshToken" help="Usually obtained via 'Authorize YouTube' button below.">
          <Input.Password prefix={<LockOutlined />} placeholder="Google OAuth Refresh Token" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">Save YouTube Config</Button>
            <Button 
              icon={<GoogleOutlined />} 
              onClick={onAuthorizeYoutube}
              disabled={!configs.youtube?.clientId || !configs.youtube?.clientSecret || youtubeStatus?.connected}
            >
              {youtubeStatus?.connected ? 'YouTube Authorized' : 'Authorize YouTube'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </>
  );

  const items = [
    {
      key: 'zoom',
      label: <Space><VideoCameraOutlined />Zoom</Space>,
      children: zoomTabContent,
      forceRender: true,
    },
    {
      key: 'youtube',
      label: <Space><YoutubeOutlined />YouTube</Space>,
      children: youtubeTabContent,
      forceRender: true,
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Title level={2}>
        <Space>
          <SettingOutlined />
          <span>Integration & API Credentials</span>
        </Space>
      </Title>
      <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>
        Manage your third-party API credentials and activation status here.
      </Text>

      <Card loading={configsLoading}>
        <Tabs 
          activeKey={searchParams.get('tab') || 'zoom'} 
          onChange={(key) => router.push(`/integrations?tab=${key}`)}
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
