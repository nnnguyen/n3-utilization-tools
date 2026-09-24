'use client';

import React, { Suspense, useRef, useState } from 'react';
import { Button, Card, Typography, Form, Input, Checkbox, message, Divider } from 'antd';
import { GoogleOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { API_URL, apiFetch } from '@/lib/api';
import RegisterModal from '@/components/auth/RegisterModal';
import ForgotPasswordModal from '@/components/auth/ForgotPasswordModal';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { setAuthToken } from '@/lib/auth-token';
import { useT, translateNow } from '@/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const { Title, Text } = Typography;

// Stores the token and hands the user (without the token) to the auth context
function completeLogin(data: any, login: (user: any) => void) {
  const { accessToken, ...user } = data;
  setAuthToken(accessToken);
  login(user);
}

function LoginErrorHandler({ router }: { router: ReturnType<typeof useRouter> }) {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  // The code is single-use; don't trade it twice (e.g. React Strict Mode re-running effects)
  const exchangedCode = useRef<string | null>(null);

  // After Google sign-in the backend redirects here with a one-time code
  useEffect(() => {
    const code = searchParams.get('authCode');
    if (!code || exchangedCode.current === code) return;
    exchangedCode.current = code;
    (async () => {
      try {
        const data = await apiFetch('/auth/exchange', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        completeLogin(data, login);
        router.replace('/');
      } catch (error: any) {
        message.error(error.message || translateNow('auth.googleFailed'));
        router.replace('/login');
      }
    })();
  }, [searchParams, router, login]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      if (error === 'google_auth_failed') {
        message.error(translateNow('auth.googleFailed'));
      } else if (error === 'google_auth_error') {
        message.error(translateNow('auth.googleError'));
      }
      // Clear URL params
      router.replace('/login');
    }
  }, [searchParams, router]);

  return null;
}

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const userData = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      completeLogin(userData, login);
      message.success(t('auth.loginSuccess'));
      router.push('/');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: 'var(--color-bg)'
      }}
    >
      <Suspense fallback={null}>
        <LoginErrorHandler router={router} />
      </Suspense>
      <Card style={{ width: 400, boxShadow: 'var(--shadow-md)' }}>
        {/* No account yet on this page: the choice is kept in this browser until sign-in */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <LanguageSwitcher />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>N3 Connect</Title>
          <Text type="secondary">{t('app.slogan')}</Text>
          <Title level={4} style={{ marginTop: 8, color: 'var(--color-text-muted)' }}>{t('auth.login')}</Title>
        </div>

        <Form
          name="login_form"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: t('auth.emailRequired') },
              { type: 'email', message: t('auth.emailInvalid') }
            ]}
          >
            <Input prefix={<UserOutlined style={{ color: 'var(--color-text-muted)' }} />} placeholder={t('auth.email')} />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('auth.passwordRequired') }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'var(--color-text-muted)' }} />}
              placeholder={t('auth.password')}
            />
          </Form.Item>

          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>{t('auth.remember')}</Checkbox>
              </Form.Item>
              <a onClick={() => setIsForgotOpen(true)}>
                {t('auth.forgot')}
              </a>
            </div>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 48 }}>
              {t('auth.login')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Text type="secondary">{t('auth.noAccount')}</Text>
          <a onClick={() => setIsRegisterOpen(true)} style={{ fontWeight: 'bold' }}>{t('auth.register')}</a>
        </div>

        <Divider plain>{t('auth.or')}</Divider>

        <Button
          icon={<GoogleOutlined />}
          block
          onClick={handleGoogleLogin}
          style={{ 
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'none'
          }}
        >
          {t('auth.withGoogle')}
        </Button>
      </Card>

      <RegisterModal 
        open={isRegisterOpen} 
        onCancel={() => setIsRegisterOpen(false)} 
        onSuccess={() => setIsRegisterOpen(false)}
      />
      
      <ForgotPasswordModal 
        open={isForgotOpen} 
        onCancel={() => setIsForgotOpen(false)} 
      />
    </main>
  );
}
