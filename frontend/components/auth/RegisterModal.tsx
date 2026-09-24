'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Button, message, Typography } from 'antd';
import { apiFetch } from '@/lib/api';
import { N3ConnectMark } from '@/components/N3ConnectLogo';
import { useT } from '@/lib/i18n';

const { Title } = Typography;

interface RegisterModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function RegisterModal({ open, onCancel, onSuccess }: RegisterModalProps) {
  const t = useT();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      message.success(res.message || t('auth.registerSuccess'));
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={400}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <N3ConnectMark size={72} style={{ margin: '0 auto 12px' }} />
        <Title level={2} style={{ margin: 0 }}>N3 Connect</Title>
        <Title level={4} style={{ marginTop: 8, color: 'var(--color-text-muted)' }}>{t('auth.register')}</Title>
      </div>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        style={{ marginTop: 20 }}
      >
        <Form.Item
          name="email"
          label={t('auth.email')}
          rules={[
            { required: true, message: t('auth.emailRequired') },
            { type: 'email', message: t('auth.emailInvalid') }
          ]}
        >
          <Input placeholder={t('auth.emailPlaceholder')} size="large" />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('auth.password')}
          rules={[
            { required: true, message: t('auth.passwordRequired') },
            { min: 6, message: t('auth.passwordMin') }
          ]}
        >
          <Input.Password placeholder={t('auth.passwordPlaceholder')} size="large" />
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
          <Input.Password placeholder={t('auth.confirmPassword')} size="large" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: 48 }}>
            {t('auth.register')}
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
