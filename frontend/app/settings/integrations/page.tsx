'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Card, Row, Col, Typography, Form, Input, Button, Space, Switch, Divider, message, Alert, Avatar, Tag, Tooltip, Drawer, Grid, Popconfirm } from 'antd';
import { SettingOutlined, LockOutlined, GoogleOutlined, ReloadOutlined, CloudOutlined, CalendarOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '../../../components/DashboardLayout';
import { API_URL, apiFetch } from '@/lib/api';
import { AUTH_RETURN_TO_KEY } from '../../../components/YoutubeTokenBanner';
import { YoutubeLogo, ZoomLogo } from '../../../components/BrandLogos';
import { useFormat, useT, useTNode, type MessageKey } from '@/lib/i18n';
import { canAuthorize, cardState, type CardState, type ConnectionCard } from '@/lib/connection-status';

const { Title, Text } = Typography;

type ProviderId = ConnectionCard['provider'];

const STATE_TAG: Record<CardState, { color: string; label: MessageKey }> = {
  connected: { color: 'success', label: 'integ.state.connected' },
  needs_reauth: { color: 'warning', label: 'integ.state.needsReauth' },
  disabled: { color: 'default', label: 'integ.state.disabled' },
  not_connected: { color: 'default', label: 'integ.state.notConnected' },
};

// Apps planned on the connector framework (ROADMAP §2.1): shown, not usable yet
const COMING_SOON: { key: string; icon: React.ReactNode; name: MessageKey; desc: MessageKey }[] = [
  { key: 'drive', icon: <CloudOutlined />, name: 'integ.soon.drive', desc: 'integ.soon.driveDesc' },
  { key: 'calendar', icon: <CalendarOutlined />, name: 'integ.soon.calendar', desc: 'integ.soon.calendarDesc' },
];

// Send a secret only when the user typed one; empty means "keep the saved value"
function nonEmpty(values: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => !!v));
}

function IntegrationsContent() {
  const t = useT();
  const tNode = useTNode();
  const fmt = useFormat();
  const screens = Grid.useBreakpoint();
  const [loading, setLoading] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [cards, setCards] = useState<ConnectionCard[]>([]);
  const [youtubeStatus, setYoutubeStatus] = useState<any>(null);
  const [checkingYoutube, setCheckingYoutube] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoomForm] = Form.useForm();
  const [youtubeForm] = Form.useForm();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ?tab=youtube|zoom (links from other pages, the OAuth return) opens its drawer
  const tab = searchParams.get('tab');
  const drawer: ProviderId | null = tab === 'youtube' || tab === 'zoom' ? tab : null;
  const openDrawer = (provider: ProviderId) => router.replace(`/settings/integrations?tab=${provider}`);
  const closeDrawer = () => router.replace('/settings/integrations');

  const cardOf = (provider: ProviderId) => cards.find(c => c.provider === provider);

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
      fetchCards();
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

  const fillForms = (list: ConnectionCard[]) => {
    const youtube = list.find(c => c.provider === 'youtube');
    const zoom = list.find(c => c.provider === 'zoom');
    // Secrets are never sent back: their inputs start empty (placeholder says whether one is saved)
    youtubeForm.setFieldsValue({
      isActive: youtube?.status === 'active',
      clientId: youtube?.settings.clientId ?? '',
      clientSecret: '',
      refreshToken: '',
    });
    zoomForm.setFieldsValue({
      isActive: zoom?.status === 'active',
      accountId: zoom?.settings.accountId ?? '',
      clientId: zoom?.settings.clientId ?? '',
      clientSecret: '',
      webhookSecretToken: '',
    });
  };

  const fetchCards = async () => {
    setLoading(true);
    try {
      const list: ConnectionCard[] = await apiFetch('/connections');
      setCards(list);
      fillForms(list);
      fetchYoutubeStatus();
    } catch (error: any) {
      message.error(t('zoomDash.loadConfigFailed'));
    } finally {
      setLoading(false);
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
    fetchCards();
  }, []);

  const save = async (provider: ProviderId, values: Record<string, any>) => {
    const settingsFields = provider === 'zoom' ? ['accountId', 'clientId'] : ['clientId'];
    const secretFields = provider === 'zoom' ? ['clientSecret', 'webhookSecretToken'] : ['clientSecret', 'refreshToken'];
    setSaving(true);
    try {
      await apiFetch(`/connections/${provider}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: !!values.isActive,
          settings: Object.fromEntries(settingsFields.map(f => [f, values[f] ?? ''])),
          secrets: nonEmpty(Object.fromEntries(secretFields.map(f => [f, values[f]]))),
        }),
      });
      message.success(t(provider === 'zoom' ? 'integ.zoomSaved' : 'integ.ytSaved'));
      fetchCards();
    } catch (error: any) {
      message.error(error.message || t(provider === 'zoom' ? 'integ.zoomSaveFailed' : 'integ.ytSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (provider: ProviderId) => {
    try {
      await apiFetch(`/connections/${provider}/disconnect`, { method: 'POST' });
      message.success(t('integ.disconnected'));
      fetchCards();
    } catch (error: any) {
      message.error(error.message || t('integ.disconnectFailed'));
    }
  };

  const onAuthorizeYoutube = async () => {
    try {
      const { url } = await apiFetch('/youtube/auth-url');
      window.location.href = url;
    } catch (error: any) {
      message.error(error.message || t('integ.authUrlFailed'));
    }
  };

  const zoomSettings = (
    <>
      <Form form={zoomForm} layout="vertical" onFinish={values => save('zoom', values)}>
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
          <Input.Password prefix={<LockOutlined />} placeholder={cardOf('zoom')?.secrets.clientSecret ? t('integ.secretSaved') : 'Zoom Client Secret'} />
        </Form.Item>
        <Form.Item label="Webhook Secret Token" name="webhookSecretToken">
          <Input.Password prefix={<LockOutlined />} placeholder={cardOf('zoom')?.secrets.webhookSecretToken ? t('integ.secretSaved') : 'Zoom Webhook Secret Token'} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('integ.saveZoom')}</Button>
        </Form.Item>
      </Form>

      <Divider />

      <Text type="secondary">
        <strong>{t('integ.webhookEndpoint')}</strong><br/>
        {/* The backend this frontend talks to: what Zoom must call */}
        <Text code copyable>{`${API_URL}/zoom/webhook`}</Text>
      </Text>
    </>
  );

  const youtubeSettings = (
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
            <Button size="small" icon={<ReloadOutlined />} onClick={fetchYoutubeStatus} loading={checkingYoutube}>
              {t('integ.recheck')}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={youtubeForm} layout="vertical" onFinish={values => save('youtube', values)}>
        <Form.Item label={t('integ.activation')} name="isActive" valuePropName="checked">
          <Switch checkedChildren={t('integ.active')} unCheckedChildren={t('integ.inactive')} />
        </Form.Item>
        <Form.Item label="Client ID" name="clientId">
          <Input prefix={<LockOutlined />} placeholder="Google Client ID" />
        </Form.Item>
        <Form.Item label="Client Secret" name="clientSecret">
          <Input.Password prefix={<LockOutlined />} placeholder={cardOf('youtube')?.secrets.clientSecret ? t('integ.secretSaved') : 'Google Client Secret'} />
        </Form.Item>
        <Form.Item label="Refresh Token" name="refreshToken" help={t('integ.refreshTokenHelp')}>
          <Input.Password prefix={<LockOutlined />} placeholder={cardOf('youtube')?.secrets.refreshToken ? t('integ.secretSaved') : 'Google OAuth Refresh Token'} />
        </Form.Item>
        <Form.Item>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving}>{t('integ.saveYoutube')}</Button>
            <Button
              icon={<GoogleOutlined />}
              onClick={onAuthorizeYoutube}
              disabled={!cardOf('youtube') || !canAuthorize(cardOf('youtube')!)}
            >
              {cardOf('youtube')?.connected ? t('integ.reauthorize') : t('integ.authorizeYoutube')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </>
  );

  const providerCard = (provider: ProviderId) => {
    const card = cardOf(provider);
    const state: CardState = card ? cardState(card) : 'not_connected';
    const tag = STATE_TAG[state];
    const isYoutube = provider === 'youtube';

    const details: React.ReactNode[] = [];
    if (isYoutube && state === 'connected' && youtubeStatus?.connected && youtubeStatus.channelTitle) {
      details.push(
        <Space key="channel" size={8}>
          {youtubeStatus.channelThumbnail && <Avatar size={20} src={youtubeStatus.channelThumbnail} />}
          <Text>{youtubeStatus.channelTitle}</Text>
        </Space>,
      );
    }
    if (!isYoutube && card?.externalAccountId) {
      details.push(<Text key="account" type="secondary">{t('integ.card.account', { account: card.externalAccountId })}</Text>);
    }
    if (card?.quota && state === 'connected') {
      details.push(
        <Text key="quota" type="secondary">
          {t('integ.card.quota', { used: fmt.number(card.quota.unitsUsed), limit: fmt.number(card.quota.quotaLimit) })}
        </Text>,
      );
    }
    if (card?.tokenHealth.expiringSoon) {
      details.push(
        <Text key="expiry" type="warning">
          {t('integ.card.expiring', { days: card.tokenHealth.daysRemaining ?? 0 })}
        </Text>,
      );
    }

    const actions: React.ReactNode[] = [];
    if (isYoutube && card && (state === 'needs_reauth' || (state === 'not_connected' && canAuthorize(card)))) {
      actions.push(
        <Button key="auth" type="primary" icon={<GoogleOutlined />} onClick={onAuthorizeYoutube}>
          {state === 'needs_reauth' ? t('integ.reauthorize') : t('integ.card.connect')}
        </Button>,
      );
    }
    actions.push(
      <Button key="settings" icon={<SettingOutlined />} onClick={() => openDrawer(provider)}>
        {state === 'not_connected' && !(isYoutube && card && canAuthorize(card)) ? t('integ.card.setUp') : t('integ.card.configure')}
      </Button>,
    );
    if (card && (state === 'connected' || state === 'needs_reauth')) {
      actions.push(
        <Popconfirm
          key="disconnect"
          title={t('integ.card.disconnectConfirm')}
          description={t(isYoutube ? 'integ.card.disconnectYoutubeHint' : 'integ.card.disconnectZoomHint')}
          onConfirm={() => disconnect(provider)}
          okText={t('integ.card.disconnect')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true }}
        >
          <Button danger type="text" icon={<DisconnectOutlined />}>{t('integ.card.disconnect')}</Button>
        </Popconfirm>,
      );
    }

    return (
      <Card loading={loading && !card} style={{ height: '100%' }} styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12, height: '100%' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 28 }}>
          {isYoutube ? <YoutubeLogo height={22} /> : <ZoomLogo height={18} />}
          <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>{t(tag.label)}</Tag>
        </div>
        <Text type="secondary">{t(isYoutube ? 'integ.card.youtubeDesc' : 'integ.card.zoomDesc')}</Text>
        {details.length > 0 && <Space orientation="vertical" size={4}>{details}</Space>}
        <Space wrap style={{ marginTop: 'auto' }}>{actions}</Space>
      </Card>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Title level={2}>
        <Space>
          <SettingOutlined />
          <span>{t('integ.title')}</span>
        </Space>
      </Title>
      <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>
        {t('integ.subtitle')}
      </Text>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={8}>{providerCard('youtube')}</Col>
        <Col xs={24} md={12} lg={8}>{providerCard('zoom')}</Col>
        {COMING_SOON.map(app => (
          <Col key={app.key} xs={24} md={12} lg={8}>
            <Card style={{ height: '100%' }} styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 28 }}>
                <Space><span style={{ fontSize: 20, color: 'var(--color-text-muted)' }}>{app.icon}</span><Text strong>{t(app.name)}</Text></Space>
                <Tag style={{ marginInlineEnd: 0 }}>{t('integ.state.comingSoon')}</Tag>
              </div>
              <Text type="secondary">{t(app.desc)}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Drawer
        title={drawer === 'zoom' ? <ZoomLogo height={16} /> : <YoutubeLogo height={20} />}
        open={drawer !== null}
        onClose={closeDrawer}
        size={screens.sm ? 520 : '100%'}
        forceRender
      >
        {/* Both forms stay mounted so setFieldsValue always has a target */}
        <div style={{ display: drawer === 'youtube' ? 'block' : 'none' }}>{youtubeSettings}</div>
        <div style={{ display: drawer === 'zoom' ? 'block' : 'none' }}>{zoomSettings}</div>
      </Drawer>
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
