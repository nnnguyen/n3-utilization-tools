'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { N3ConnectLockup } from '@/components/N3ConnectLogo';

const { Title, Text } = Typography;

// Outside DashboardLayout: it is where the layout sends accounts that must
// replace a temp password, and it is also opened from the user menu
export default function ChangePasswordPage() {
  const t = useT();
  const router = useRouter();
  const { user, loading, updateUser, logout } = useAuth();
  const [saving, setSaving] = useState(false);
  const forced = !!user?.mustChangePassword;

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  const onFinish = async (values: { currentPassword?: string; newPassword: string }) => {
    setSaving(true);
    try {
      const session = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      updateUser(session);
      message.success(t('changePassword.done'));
      router.replace('/');
    } catch (error: any) {
      message.error(error.message || t('changePassword.failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 4vw, 24px)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <LanguageSwitcher />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <N3ConnectLockup height={48} />
          <Title level={4} style={{ marginTop: 12 }}>{t('changePassword.title')}</Title>
          <Text type="secondary">{user.email}</Text>
        </div>
        {forced && (
          <Alert type="warning" showIcon title={t('changePassword.forced')} style={{ marginBottom: 16 }} />
        )}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          {user.hasPassword !== false && (
            <Form.Item
              name="currentPassword"
              label={forced ? t('changePassword.tempPassword') : t('changePassword.current')}
              rules={[{ required: true, message: t('auth.passwordRequired') }]}
            >
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
            </Form.Item>
          )}
          <Form.Item
            name="newPassword"
            label={t('changePassword.new')}
            rules={[
              { required: true, message: t('auth.passwordRequired') },
              { min: 6, message: t('changePassword.min') },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label={t('changePassword.confirm')}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('auth.passwordRequired') },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || value === getFieldValue('newPassword')
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('changePassword.mismatch'))),
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving} style={{ height: 44 }}>
            {t('changePassword.submit')}
          </Button>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            {forced ? (
              <Button type="link" onClick={logout}>{t('nav.logout')}</Button>
            ) : (
              <Button type="link" onClick={() => router.back()}>{t('common.cancel')}</Button>
            )}
          </div>
        </Form>
      </Card>
    </main>
  );
}
