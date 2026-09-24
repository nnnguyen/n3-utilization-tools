'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Button, Typography, message } from 'antd';
import { apiFetch } from '@/lib/api';
import { useT, useTNode } from '@/lib/i18n';

const { Title, Paragraph, Text } = Typography;

interface ForgotPasswordModalProps {
  open: boolean;
  onCancel: () => void;
}

export default function ForgotPasswordModal({ open, onCancel }: ForgotPasswordModalProps) {
  const t = useT();
  const tNode = useTNode();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState('');

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: values.email }),
      });

      setSubmitted(true);
      setEmailSent(values.email);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setEmailSent('');
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={450}
      closable={true}
    >
      <div style={{ textAlign: 'center', padding: '20px 10px' }}>
        <Title level={2} style={{ fontSize: 28, fontWeight: 800, textTransform: 'uppercase', marginBottom: 20 }}>
          {t('auth.forgotTitle')}
        </Title>
        
        <Paragraph style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
          {t('auth.forgotSubtitle')}
        </Paragraph>
        
        <Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 25 }}>
          {t('auth.forgotDesc')}
        </Paragraph>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label={<Text strong>{t('auth.forgotEmailLabel')} <Text type="danger">*</Text></Text>}
            rules={[
              { required: true, message: t('auth.emailRequired') },
              { type: 'email', message: t('auth.emailInvalid') }
            ]}
          >
            <Input 
              placeholder={t('auth.emailPlaceholder')}
              size="large"
            />
          </Form.Item>

          {submitted && (
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
                <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 13 }}>
                    * {tNode('auth.forgotSent', { email: <Text strong style={{ color: 'var(--color-accent)' }}>{emailSent}</Text> })}
                </Text>
            </div>
          )}

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large" 
              block 
              loading={loading}
              style={{ height: 50, fontWeight: 'bold', fontSize: 16 }}
            >
              {submitted ? t('auth.resend') : t('auth.sendRequest')}
            </Button>
          </Form.Item>
          
          <Button type="link" onClick={handleClose} style={{ color: 'var(--color-text-muted)' }}>
            {t('common.close')}
          </Button>
        </Form>
      </div>
    </Modal>
  );
}
