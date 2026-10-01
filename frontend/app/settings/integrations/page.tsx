'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Card, Row, Col, Typography, Form, Input, Button, Space, Switch, Divider, message, Alert, Avatar, Tag, Tooltip, Drawer, Grid, Popconfirm, Modal, Tabs } from 'antd';
import { SettingOutlined, LockOutlined, GoogleOutlined, ReloadOutlined, CloudOutlined, DisconnectOutlined, FolderOpenOutlined, DatabaseOutlined, MessageOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '../../../components/DashboardLayout';
import { FileExplorer } from '../../../components/FileExplorer';
import { API_URL, apiFetch } from '@/lib/api';
import { AUTH_RETURN_TO_KEY } from '../../../components/YoutubeTokenBanner';
import { YoutubeLogo, ZoomLogo } from '../../../components/BrandLogos';
import { useFormat, useT, useTNode, type MessageKey } from '@/lib/i18n';
import { canAuthorize, cardState, formatBytes, type CardState, type ConnectionCard } from '@/lib/connection-status';

function onedriveCallbackUrl() {
  const path = "/api/connections/onedrive/callback";
  if (process.env.NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN}${path}`;
  return `http://localhost:3001${path}`;
}

const { Title, Text } = Typography;

type ProviderId = ConnectionCard['provider'];

const STATE_TAG: Record<CardState, { color: string; label: MessageKey }> = {
  connected: { color: 'success', label: 'integ.state.connected' },
  needs_reauth: { color: 'warning', label: 'integ.state.needsReauth' },
  disabled: { color: 'default', label: 'integ.state.disabled' },
  not_connected: { color: 'default', label: 'integ.state.notConnected' },
};

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
  const [explorerProvider, setExplorerProvider] = useState<'google_drive' | 'onedrive' | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<any>(null);
  const [checkingYoutube, setCheckingYoutube] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoomForm] = Form.useForm();
  const [youtubeForm] = Form.useForm();
  const [onedriveForm] = Form.useForm();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ?tab=youtube|zoom (links from other pages, the OAuth return) opens its drawer
  const tab = searchParams.get('tab');
  const drawer: ProviderId | null = tab === 'youtube' || tab === 'zoom' || tab === 'onedrive' ? tab : null;
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

  // Back from Google's Drive consent screen (the backend handled the code)
  useEffect(() => {
    const drive = searchParams.get('drive');
    const onedrive = searchParams.get('onedrive');
    
    if (drive) {
      if (drive === 'connected') message.success(t('integ.driveConnected'));
      else if (drive === 'cancelled') message.info(t('integ.driveCancelled'));
      else message.error(t('integ.driveError'));
      router.replace('/settings/integrations');
    }
    
    if (onedrive) {
      if (onedrive === 'connected') message.success(t('integ.onedriveConnected'));
      else if (onedrive === 'cancelled') message.info(t('integ.onedriveCancelled'));
      else message.error(t('integ.onedriveError'));
      router.replace('/settings/integrations');
    }
  }, [searchParams]);

  const fillForms = (list: ConnectionCard[]) => {
    const youtube = list.find(c => c.provider === 'youtube');
    const zoom = list.find(c => c.provider === 'zoom');
    const onedrive = list.find(c => c.provider === 'onedrive');
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
    onedriveForm.setFieldsValue({
      isActive: onedrive?.status === 'active',
      clientId: onedrive?.settings.clientId ?? '',
      tenantId: onedrive?.settings.tenantId ?? 'common',
      clientSecret: '',
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
    const settingsFields = 
      provider === 'zoom' ? ['accountId', 'clientId'] : 
      provider === 'onedrive' ? ['clientId', 'tenantId'] : ['clientId'];
    const secretFields = 
      provider === 'zoom' ? ['clientSecret', 'webhookSecretToken'] : ['clientSecret', 'refreshToken'];
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
      message.success(t(
        provider === 'zoom' ? 'integ.zoomSaved' : 
        provider === 'onedrive' ? 'integ.onedriveSaved' : 'integ.ytSaved'
      ));
      fetchCards();
    } catch (error: any) {
      message.error(error.message || t(
        provider === 'zoom' ? 'integ.zoomSaveFailed' : 
        provider === 'onedrive' ? 'integ.onedriveSaveFailed' : 'integ.ytSaveFailed'
      ));
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

  const onConnectDrive = async () => {
    try {
      const { url } = await apiFetch('/connections/google_drive/auth-url');
      window.location.href = url;
    } catch (error: any) {
      message.error(error.message || t('integ.authUrlFailed'));
    }
  };

  const onConnectOneDrive = async () => {
    try {
      const { url } = await apiFetch('/connections/onedrive/auth-url');
      window.location.href = url;
    } catch (error: any) {
      message.error(error.message || t('integ.authUrlFailed'));
    }
  };

  // Google Drive (P2-3): connected only by authorizing, with the YouTube card's Google app
  const driveCard = () => {
    const card = cardOf('google_drive');
    const youtube = cardOf('youtube');
    const state: CardState = card ? cardState(card) : 'not_connected';
    const tag = STATE_TAG[state];
    const googleAppReady = !!youtube && canAuthorize(youtube);

    const details: React.ReactNode[] = [];
    if (card?.externalAccountId && state !== 'not_connected') {
      details.push(
        <Text key="account">{card.externalAccountName ? `${card.externalAccountName} · ` : ''}{card.externalAccountId}</Text>,
      );
    }
    if (card?.storage && state === 'connected') {
      const used = formatBytes(card.storage.usage, fmt.locale);
      details.push(
        <Text key="storage" type="secondary">
          {card.storage.limit
            ? t('integ.card.storage', { used, limit: formatBytes(card.storage.limit, fmt.locale) })
            : t('integ.card.storageUnlimited', { used })}
        </Text>,
      );
    }
    if (card?.tokenHealth.expiringSoon) {
      details.push(
        <Text key="expiry" type="warning">{t('integ.card.expiring', { days: card.tokenHealth.daysRemaining ?? 0 })}</Text>,
      );
    }
    if (state !== 'connected' && !googleAppReady) {
      details.push(<Text key="needs" type="warning">{t('integ.card.driveNeedsYoutube')}</Text>);
    }

    const actions: React.ReactNode[] = [];
    if (state !== 'connected') {
      actions.push(
        <Button key="auth" type="primary" icon={<GoogleOutlined />} onClick={onConnectDrive} disabled={!googleAppReady}>
          {state === 'needs_reauth' ? t('integ.reauthorize') : t('integ.card.driveConnect')}
        </Button>,
      );
    }
    if (card && (state === 'connected' || state === 'needs_reauth')) {
      if (state === 'connected') {
        actions.push(
          <Button key="explorer" icon={<FolderOpenOutlined />} onClick={() => setExplorerProvider('google_drive')}>
            {t('explorer.title')}
          </Button>
        );
      }
      actions.push(
        <Popconfirm
          key="disconnect"
          title={t('integ.card.disconnectConfirm')}
          description={t('integ.card.disconnectDriveHint')}
          onConfirm={() => disconnect('google_drive')}
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
          <Space><CloudOutlined style={{ fontSize: 20 }} /><Text strong>{t('integ.card.driveName')}</Text></Space>
          <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>{t(tag.label)}</Tag>
        </div>
        <Text type="secondary">{t('integ.card.driveDesc')}</Text>
        {details.length > 0 && <Space orientation="vertical" size={4}>{details}</Space>}
        {actions.length > 0 && <Space wrap style={{ marginTop: 'auto' }}>{actions}</Space>}
      </Card>
    );
  };

  const onedriveCard = () => {
    const card = cardOf('onedrive');
    const state: CardState = card ? cardState(card) : 'not_connected';
    const tag = STATE_TAG[state];
    const onedriveReady = !!card && canAuthorize(card);

    const details: React.ReactNode[] = [];
    if (card?.externalAccountId && state !== 'not_connected') {
      details.push(
        <Text key="account">{card.externalAccountName ? `${card.externalAccountName} · ` : ''}{card.externalAccountId}</Text>,
      );
    }
    if (card?.storage && state === 'connected') {
      const used = formatBytes(card.storage.usage, fmt.locale);
      details.push(
        <Text key="storage" type="secondary">
          {card.storage.limit
            ? t('integ.card.storage', { used, limit: formatBytes(card.storage.limit, fmt.locale) })
            : t('integ.card.storageUnlimited', { used })}
        </Text>,
      );
    }

    const actions: React.ReactNode[] = [];
    if (state !== 'connected') {
      actions.push(
        <Button key="auth" type="primary" icon={<CloudOutlined />} onClick={onConnectOneDrive} disabled={!onedriveReady}>
          {state === 'needs_reauth' ? t('integ.reauthorize') : t('integ.card.onedriveConnect')}
        </Button>,
      );
    }
    actions.push(
      <Button key="settings" icon={<SettingOutlined />} onClick={() => openDrawer('onedrive')}>
        {state === 'not_connected' && !onedriveReady ? t('integ.card.setUp') : t('integ.card.configure')}
      </Button>,
    );
    if (card && (state === 'connected' || state === 'needs_reauth')) {
      if (state === 'connected') {
        actions.push(
          <Button key="explorer" icon={<FolderOpenOutlined />} onClick={() => setExplorerProvider('onedrive')}>
            {t('explorer.title')}
          </Button>
        );
      }
      actions.push(
        <Popconfirm
          key="disconnect"
          title={t('integ.card.disconnectConfirm')}
          description={t('integ.card.disconnectOneDriveHint')}
          onConfirm={() => disconnect('onedrive')}
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
          <Space><CloudOutlined style={{ fontSize: 20, color: '#0078d4' }} /><Text strong>{t('integ.card.onedriveName')}</Text></Space>
          <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>{t(tag.label)}</Tag>
        </div>
        <Text type="secondary">{t('integ.card.onedriveDesc')}</Text>
        {details.length > 0 && <Space orientation="vertical" size={4}>{details}</Space>}
        {actions.length > 0 && <Space wrap style={{ marginTop: 'auto' }}>{actions}</Space>}
      </Card>
    );
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

  const onedriveSettings = (
    <Form form={onedriveForm} layout="vertical" onFinish={values => save('onedrive', values)}>
      <Form.Item label={t('integ.activation')} name="isActive" valuePropName="checked">
        <Switch checkedChildren={t('integ.active')} unCheckedChildren={t('integ.inactive')} />
      </Form.Item>
      <Form.Item label="Client ID" name="clientId">
        <Input prefix={<LockOutlined />} placeholder="Microsoft Azure Client ID" />
      </Form.Item>
      <Form.Item label="Tenant ID" name="tenantId" help={t('integ.onedriveTenantHelp')}>
        <Input prefix={<LockOutlined />} placeholder="common" />
      </Form.Item>
      <Form.Item label="Client Secret" name="clientSecret">
        <Input.Password prefix={<LockOutlined />} placeholder={cardOf('onedrive')?.secrets.clientSecret ? t('integ.secretSaved') : 'Microsoft Azure Client Secret'} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>{t('integ.saveOneDrive')}</Button>
      </Form.Item>
      <Divider />
      <Text type="secondary">
        <strong>{t('integ.onedriveRedirectUri')}</strong><br/>
        <Text code copyable>{onedriveCallbackUrl()}</Text>
      </Text>
    </Form>
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

      <Modal
        title={t('explorer.title')}
        open={!!explorerProvider}
        onCancel={() => setExplorerProvider(null)}
        width={1000}
        footer={null}
        destroyOnHidden
      >
        {explorerProvider && <FileExplorer provider={explorerProvider} />}
      </Modal>

      <Tabs
        defaultActiveKey="all"
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'all',
            label: (
              <Space>
                <SettingOutlined />
                {t('integ.category.all')}
              </Space>
            ),
            children: (
              <>
                <Title level={4} style={{ marginTop: 16, marginBottom: 16 }}>
                  <Space><DatabaseOutlined />{t('integ.category.storage')}</Space>
                </Title>
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12} lg={8}>{driveCard()}</Col>
                  <Col xs={24} md={12} lg={8}>{onedriveCard()}</Col>
                </Row>

                <Title level={4} style={{ marginTop: 32, marginBottom: 16 }}>
                  <Space><MessageOutlined />{t('integ.category.communication')}</Space>
                </Title>
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12} lg={8}>{providerCard('zoom')}</Col>
                </Row>

                <Title level={4} style={{ marginTop: 32, marginBottom: 16 }}>
                  <Space><ShareAltOutlined />{t('integ.category.social')}</Space>
                </Title>
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12} lg={8}>{providerCard('youtube')}</Col>
                </Row>
              </>
            ),
          },
          {
            key: 'storage',
            label: (
              <Space>
                <DatabaseOutlined />
                {t('integ.category.storage')}
              </Space>
            ),
            children: (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} md={12} lg={8}>{driveCard()}</Col>
                <Col xs={24} md={12} lg={8}>{onedriveCard()}</Col>
              </Row>
            ),
          },
          {
            key: 'communication',
            label: (
              <Space>
                <MessageOutlined />
                {t('integ.category.communication')}
              </Space>
            ),
            children: (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} md={12} lg={8}>{providerCard('zoom')}</Col>
              </Row>
            ),
          },
          {
            key: 'social',
            label: (
              <Space>
                <ShareAltOutlined />
                {t('integ.category.social')}
              </Space>
            ),
            children: (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} md={12} lg={8}>{providerCard('youtube')}</Col>
              </Row>
            ),
          },
        ]}
      />

      <Drawer
        title={
          drawer === 'zoom' ? <ZoomLogo height={16} /> : 
          drawer === 'onedrive' ? <Space><CloudOutlined style={{ color: '#0078d4' }} />OneDrive</Space> : 
          <YoutubeLogo height={20} />
        }
        open={drawer !== null}
        onClose={closeDrawer}
        size={screens.sm ? 520 : '100%'}
        forceRender
      >
        {/* Both forms stay mounted so setFieldsValue always has a target */}
        <div style={{ display: drawer === 'youtube' ? 'block' : 'none' }}>{youtubeSettings}</div>
        <div style={{ display: drawer === 'zoom' ? 'block' : 'none' }}>{zoomSettings}</div>
        <div style={{ display: drawer === 'onedrive' ? 'block' : 'none' }}>{onedriveSettings}</div>
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
