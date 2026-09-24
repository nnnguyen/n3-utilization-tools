'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Typography, Form, Input, Button, message, Result, Spin } from 'antd';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

const { Title, Paragraph } = Typography;

function ResetPasswordContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: any) => {
    if (!token) {
      message.error(t('reset.invalidToken'));
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      setSuccess(true);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Card style={{ width: 400 }}>
        <Result
          status="error"
          title={t('reset.missingToken')}
          subTitle={t('reset.invalidLink')}
          extra={<Button type="primary" onClick={() => router.push('/login')}>{t('verify.backToLogin')}</Button>}
        />
      </Card>
    );
  }

  if (success) {
    return (
      <Card style={{ width: 400 }}>
        <Result
          status="success"
          title={t('reset.success')}
          extra={[
            <Button type="primary" key="login" onClick={() => router.push('/login')}>
              {t('reset.loginNow')}
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <Card style={{ width: 400 }}>
      <Title level={2} style={{ textAlign: 'center' }}>{t('reset.title')}</Title>
      <Paragraph type="secondary" style={{ textAlign: 'center' }}>
        {t('reset.desc')}
      </Paragraph>

      <Form layout="vertical" onFinish={onFinish} size="large">
        <Form.Item
          name="password"
          label={t('reset.newPassword')}
          rules={[
            { required: true, message: t('reset.newPasswordRequired') },
            { min: 6, message: t('auth.passwordMin') }
          ]}
        >
          <Input.Password placeholder={t('reset.newPasswordPlaceholder')} />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label={t('auth.confirmPassword')}
          dependencies={['password']}
          rules={[
            { required: true, message: t('auth.confirmRequired') },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(t('auth.confirmMismatch')));
              },
            }),
          ]}
        >
          <Input.Password placeholder={t('auth.confirmPassword')} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 48 }}>
            {t('reset.submit')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg)',
        padding: 24,
      }}
    >
      <Suspense fallback={<Spin size="large" />}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
