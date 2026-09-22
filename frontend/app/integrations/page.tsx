'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Form, Input, Button, Tabs, Space, Switch, Divider, message, Spin } from 'antd';
import { SettingOutlined, VideoCameraOutlined, YoutubeOutlined, LockOutlined } from '@ant-design/icons';
import DashboardLayout from '../../components/DashboardLayout';
import { apiFetch } from '@/lib/api';

const { Title, Text } = Typography;

export default function IntegrationsPage() {
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configs, setConfigs] = useState<any>({ zoom: {}, youtube: {} });
  const [zoomForm] = Form.useForm();
  const [youtubeForm] = Form.useForm();

  const fetchConfigs = async () => {
    setConfigsLoading(true);
    try {
      const response = await apiFetch('/integrations/config');
      setConfigs(response);
      zoomForm.setFieldsValue(response.zoom);
      youtubeForm.setFieldsValue(response.youtube);
    } catch (error: any) {
      message.error('Failed to load integration settings');
    } finally {
      setConfigsLoading(false);
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

  const youtubeTabContent = (
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
      <Form.Item label="Refresh Token" name="refreshToken">
        <Input.Password prefix={<LockOutlined />} placeholder="Google OAuth Refresh Token" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">Save YouTube Config</Button>
      </Form.Item>
    </Form>
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
    <DashboardLayout>
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
          <Tabs defaultActiveKey="zoom" items={items} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
