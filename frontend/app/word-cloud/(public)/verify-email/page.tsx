'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Typography, Button, Result, Spin, message } from 'antd';
import { apiFetch } from '@/lib/api';
import { useT, translateNow } from '@/lib/i18n';

function VerifyEmailContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (token) {
      apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
        .then((data) => {
          setSuccess(true);
          setEmail(data.email);
        })
        .catch((err) => {
          message.error(err.message || translateNow('verify.failed'));
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
        <div style={{ marginTop: 20 }}>{t('verify.verifying')}</div>
      </div>
    );
  }

  return (
    <Card style={{ width: '100%', maxWidth: 500 }}>
      {success ? (
        <Result
          status="success"
          title={t('verify.success', { email })}
          extra={[
            <Button type="primary" key="login" onClick={() => router.push('/login')} size="large">
              {t('auth.login')}
            </Button>,
          ]}
        />
      ) : (
        <Result
          status="error"
          title={t('verify.errorTitle')}
          subTitle={t('verify.errorDesc')}
          extra={[
            <Button type="primary" key="home" onClick={() => router.push('/login')}>
              {t('verify.backToLogin')}
            </Button>,
          ]}
        />
      )}
    </Card>
  );
}

export default function VerifyEmailPage() {
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
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
