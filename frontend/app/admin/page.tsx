'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Checkbox, Dropdown, Form, Input, Modal, Popconfirm, Result, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { BarChartOutlined, FundOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useFormat, useT, type MessageKey } from '@/lib/i18n';
import { trackEvent } from '@/lib/product-analytics';

const { Title, Text, Paragraph } = Typography;

// Inlined at build time; the button stays hidden until it is set on Vercel
const ANALYTICS_DASHBOARD_URL = process.env.NEXT_PUBLIC_ANALYTICS_DASHBOARD_URL;
// PostHog dashboard of product analytics (P2-8c), same rule
const POSTHOG_DASHBOARD_URL = process.env.NEXT_PUBLIC_POSTHOG_DASHBOARD_URL;

interface Account {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  isEmailVerified: boolean;
  platformRole: 'user' | 'super_admin';
  isLocked: boolean;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
  createdAt: string;
}

interface Activity {
  id: string;
  action: string;
  createdAt: string;
  actor: { email: string; name: string | null } | null;
  data: { email?: string } | null;
}

// A temp password is shown once: to copy and send (email is off for now)
function TempPasswordResult({ email, password }: { email: string; password: string }) {
  const t = useT();
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Alert type="warning" showIcon title={t('admin.tempShownOnce')} />
      <Text>{t('admin.tempFor', { email })}</Text>
      <Paragraph copyable={{ text: password }} style={{ fontSize: 20, fontFamily: 'monospace', margin: 0 }}>
        {password}
      </Paragraph>
      <Text type="secondary">{t('admin.tempHint')}</Text>
    </Space>
  );
}

function AccountsTab({ currentUserId }: { currentUserId: string }) {
  const t = useT();
  const fmt = useFormat();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<Account | null>(null);
  const [resetMustChange, setResetMustChange] = useState(true);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [form] = Form.useForm();

  const load = async (query = search) => {
    setLoading(true);
    try {
      setAccounts(await apiFetch(`/admin/users${query ? `?search=${encodeURIComponent(query)}` : ''}`));
    } catch (error: any) {
      message.error(error.message || t('admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (account: Account, changes: Partial<Account>) => {
    try {
      await apiFetch(`/admin/users/${account.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      message.success(t('admin.saved'));
      load();
    } catch (error: any) {
      message.error(error.message || t('admin.saveFailed'));
    }
  };

  const remove = async (account: Account) => {
    try {
      await apiFetch(`/admin/users/${account.id}`, { method: 'DELETE' });
      message.success(t('admin.deleted'));
      load();
    } catch (error: any) {
      message.error(error.message || t('admin.saveFailed'));
    }
  };

  const create = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const { account, tempPassword } = await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(values) });
      setCreating(false);
      form.resetFields();
      setResult({ email: account.email, password: tempPassword });
      load();
    } catch (error: any) {
      message.error(error.message || t('admin.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const resetTempPassword = async () => {
    if (!resetFor) return;
    setSaving(true);
    try {
      const { account, tempPassword } = await apiFetch(`/admin/users/${resetFor.id}/temp-password`, {
        method: 'POST',
        body: JSON.stringify({ mustChangePassword: resetMustChange }),
      });
      setResetFor(null);
      setResult({ email: account.email, password: tempPassword });
      load();
    } catch (error: any) {
      message.error(error.message || t('admin.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: t('admin.col.account'),
      key: 'account',
      render: (_: any, a: Account) => (
        <Space>
          <Avatar size="small" src={a.avatarUrl || undefined} icon={<UserOutlined />} />
          <div>
            <div><Text strong>{a.name || a.email}</Text></div>
            {a.name && <Text type="secondary" style={{ fontSize: 12 }}>{a.email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: t('admin.col.signIn'),
      key: 'signIn',
      render: (_: any, a: Account) => (
        <Space size={4} wrap>
          {a.hasGoogle && <Tag>Google</Tag>}
          {a.hasPassword && <Tag>{t('admin.password')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('admin.col.status'),
      key: 'status',
      render: (_: any, a: Account) => (
        <Space size={4} wrap>
          {a.platformRole === 'super_admin' && <Tag color="gold" icon={<SafetyCertificateOutlined />}>{t('admin.superAdmin')}</Tag>}
          {a.isLocked && <Tag color="error">{t('admin.locked')}</Tag>}
          <Tag color={a.isEmailVerified ? 'success' : 'default'}>
            {a.isEmailVerified ? t('admin.verified') : t('admin.unverified')}
          </Tag>
          {a.mustChangePassword && <Tag color="warning">{t('admin.mustChange')}</Tag>}
          {a.tempPasswordExpiresAt && (
            <Tag>{t('admin.tempUntil', { date: fmt.date(a.tempPasswordExpiresAt) })}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('admin.col.created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => fmt.date(value),
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      render: (_: any, a: Account) => {
        const self = a.id === currentUserId;
        const items = [
          { key: 'verify', label: a.isEmailVerified ? t('admin.action.unverify') : t('admin.action.verify'), onClick: () => update(a, { isEmailVerified: !a.isEmailVerified }) },
          { key: 'temp', label: t('admin.action.resetTemp'), onClick: () => { setResetMustChange(true); setResetFor(a); } },
          { key: 'role', disabled: self, label: a.platformRole === 'super_admin' ? t('admin.action.revokeAdmin') : t('admin.action.grantAdmin'), onClick: () => update(a, { platformRole: a.platformRole === 'super_admin' ? 'user' : 'super_admin' }) },
          { key: 'lock', disabled: self, label: a.isLocked ? t('admin.action.unlock') : t('admin.action.lock'), onClick: () => update(a, { isLocked: !a.isLocked }) },
        ];
        return (
          <Space size={0}>
            <Dropdown menu={{ items }} trigger={['click']}>
              <Button type="text" icon={<MoreOutlined />} aria-label={t('admin.actions')} />
            </Dropdown>
            {!self && (
              <Popconfirm
                title={t('admin.deleteConfirm', { email: a.email })}
                description={t('admin.deleteHint')}
                onConfirm={() => remove(a)}
                okText={t('common.delete')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
              >
                <Button type="text" danger size="small">{t('common.delete')}</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder={t('admin.search')}
          style={{ maxWidth: 320 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={value => load(value)}
        />
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t('admin.create')}</Button>
        </Space>
      </div>
      <Table rowKey="id" loading={loading} dataSource={accounts} columns={columns} pagination={{ pageSize: 20 }} scroll={{ x: 'max-content' }} size="middle" />

      <Modal
        title={t('admin.create')}
        open={creating}
        onOk={create}
        onCancel={() => setCreating(false)}
        okText={t('admin.createOk')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        forceRender
      >
        <Form form={form} layout="vertical" initialValues={{ isEmailVerified: true, mustChangePassword: true }}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: t('auth.emailInvalid') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label={t('admin.name')}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="isEmailVerified" valuePropName="checked" style={{ marginBottom: 4 }}>
            <Checkbox>{t('admin.markVerified')}</Checkbox>
          </Form.Item>
          <Form.Item name="mustChangePassword" valuePropName="checked" extra={t('admin.mustChangeHint')}>
            <Checkbox>{t('admin.forceChange')}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('admin.action.resetTemp')}
        open={!!resetFor}
        onOk={resetTempPassword}
        onCancel={() => setResetFor(null)}
        okText={t('admin.resetOk')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
      >
        <Space orientation="vertical">
          <Text>{t('admin.resetFor', { email: resetFor?.email ?? '' })}</Text>
          <Checkbox checked={resetMustChange} onChange={e => setResetMustChange(e.target.checked)}>
            {t('admin.forceChange')}
          </Checkbox>
          <Text type="secondary">{t('admin.mustChangeHint')}</Text>
        </Space>
      </Modal>

      <Modal
        title={t('admin.tempTitle')}
        open={!!result}
        onOk={() => setResult(null)}
        onCancel={() => setResult(null)}
        okText={t('admin.tempDone')}
        cancelButtonProps={{ style: { display: 'none' } }}
        mask={{ closable: false }}
      >
        {result && <TempPasswordResult email={result.email} password={result.password} />}
      </Modal>
    </>
  );
}

function ActivityTab() {
  const t = useT();
  const fmt = useFormat();
  const [entries, setEntries] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await apiFetch('/admin/activity?limit=200'));
    } catch (error: any) {
      message.error(error.message || t('admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const actionLabel = (action: string) => {
    const key = `admin.activity.${action}` as MessageKey;
    const text = t(key);
    return text === key ? action : text;
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh')}</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={entries}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 'max-content' }}
        size="middle"
        columns={[
          { title: t('admin.col.time'), dataIndex: 'createdAt', key: 'time', render: (v: string) => fmt.dateTime(v) },
          { title: t('admin.col.actor'), key: 'actor', render: (_: any, e: Activity) => e.actor ? (e.actor.name || e.actor.email) : <Text type="secondary">{t('admin.system')}</Text> },
          { title: t('admin.col.action'), dataIndex: 'action', key: 'action', render: actionLabel },
          { title: t('admin.col.target'), key: 'target', render: (_: any, e: Activity) => e.data?.email ?? '' },
        ]}
      />
    </>
  );
}

export default function AdminPage() {
  const t = useT();
  const { user } = useAuth();
  const isSuperAdmin = user?.platformRole === 'super_admin';

  useEffect(() => {
    if (isSuperAdmin) trackEvent('admin_page_viewed');
  }, [isSuperAdmin]);

  return (
    <DashboardLayout>
      {user?.platformRole !== 'super_admin' ? (
        <Result status="403" title="403" subTitle={t('apiError.ADMIN_ONLY')} />
      ) : (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={2} style={{ margin: 0 }}>
              <Space><SafetyCertificateOutlined /><span>{t('admin.title')}</span></Space>
            </Title>
            {/* Vercel Web Analytics (P2-7) and PostHog (P2-8) live in their own dashboards */}
            <Space wrap>
              {ANALYTICS_DASHBOARD_URL && (
                <Button icon={<BarChartOutlined />} href={ANALYTICS_DASHBOARD_URL} target="_blank" rel="noreferrer">
                  {t('admin.analytics')}
                </Button>
              )}
              {POSTHOG_DASHBOARD_URL && (
                <Button icon={<FundOutlined />} href={POSTHOG_DASHBOARD_URL} target="_blank" rel="noreferrer">
                  {t('admin.productAnalytics')}
                </Button>
              )}
            </Space>
          </div>
          <Text type="secondary" style={{ display: 'block', margin: '8px 0 16px' }}>{t('admin.subtitle')}</Text>
          <Tabs
            items={[
              { key: 'accounts', label: t('admin.tab.accounts'), children: <AccountsTab currentUserId={user.id} /> },
              { key: 'activity', label: t('admin.tab.activity'), children: <ActivityTab /> },
            ]}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
