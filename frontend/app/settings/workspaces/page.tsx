'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Row, Col, Space, Modal, Form, Input, message, Tag, Spin, Tabs, Table, Avatar } from 'antd';
import { PlusOutlined, SwapOutlined, CheckCircleOutlined, HistoryOutlined, UserOutlined } from '@ant-design/icons';
import DashboardLayout from '@/components/DashboardLayout';
import { useWorkspaces, Workspace } from '@/lib/workspaces/workspace-context';
import { useT } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Paragraph, Text } = Typography;

interface ActivityEntry {
  id: string;
  action: string;
  actor: { name: string; email: string; avatarUrl: string | null } | null;
  createdAt: string;
  data: any;
}

interface Suggestion {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  zoomAccountName: string | null;
}

export default function WorkspacesPage() {
  const t = useT();
  const { workspaces, activeWorkspace, loading, switchWorkspace, createWorkspace } = useWorkspaces();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (activeWorkspace) {
      loadActivity(activeWorkspace.id);
      loadSuggestions(activeWorkspace.id);
    }
  }, [activeWorkspace]);

  const loadActivity = async (workspaceId: string) => {
    setLoadingActivity(true);
    try {
      const data = await apiFetch(`/workspaces/${workspaceId}/activity`);
      setActivities(data);
    } catch (error) {
      console.error('Failed to load activity', error);
    } finally {
      setLoadingActivity(false);
    }
  };

  const loadSuggestions = async (workspaceId: string) => {
    try {
      const data = await apiFetch(`/workspaces/${workspaceId}/suggestions/zoom`);
      setSuggestions(data);
    } catch (error) {
      console.error('Failed to load suggestions', error);
    }
  };

  const handleCreate = async (values: { name: string }) => {
    setSubmitting(true);
    try {
      await createWorkspace(values.name);
      message.success(t('workspaces.created', { name: values.name }));
      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(t('common.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitch = async (workspaceId: string) => {
    try {
      await switchWorkspace(workspaceId);
      message.success(t('workspaces.active'));
    } catch (error) {
      message.error(t('common.genericError'));
    }
  };

  const activityColumns = [
    {
      title: t('workspace.activity.col.time'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: t('workspace.activity.col.actor'),
      key: 'actor',
      width: 200,
      render: (entry: ActivityEntry) => (
        <Space>
          <Avatar src={entry.actor?.avatarUrl} icon={<UserOutlined />} size="small" />
          <Text>{entry.actor?.name || entry.actor?.email || t('admin.system')}</Text>
        </Space>
      ),
    },
    {
      title: t('workspace.activity.col.action'),
      key: 'action',
      render: (entry: ActivityEntry) => {
        const key = `workspace.activity.action.${entry.action}` as any;
        return t(key, entry.data || {});
      },
    },
  ];

  const items = [
    {
      key: 'list',
      label: t('workspaces.title'),
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <Title level={2}>{t('workspaces.title')}</Title>
              <Paragraph type="secondary">{t('workspaces.subtitle')}</Paragraph>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              {t('workspaces.create')}
            </Button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              {suggestions.length > 0 && (
                <Card
                  size="small"
                  title={t('workspace.suggestion.zoom.title')}
                  style={{ marginBottom: 24, border: '1px solid #ffe58f', backgroundColor: '#fffbe6' }}
                >
                  <Paragraph style={{ marginBottom: 12 }}>{t('workspace.suggestion.zoom.desc')}</Paragraph>
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    {suggestions.map((s) => (
                      <div key={s.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space>
                          <Avatar src={s.avatarUrl} icon={<UserOutlined />} />
                          <div>
                            <Text strong>{s.name || s.email}</Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              Zoom: {s.zoomAccountName || t('common.unknown')}
                            </Text>
                          </div>
                        </Space>
                        <Button type="link" size="small">
                          {t('workspace.suggestion.zoom.invite')}
                        </Button>
                      </div>
                    ))}
                  </Space>
                </Card>
              )}
              <Row gutter={[16, 16]}>
                {workspaces.map((workspace: Workspace) => (
                  <Col key={workspace.id} xs={24} sm={12}>
                    <Card
                      hoverable
                      actions={[
                        workspace.id === activeWorkspace?.id ? (
                          <Tag color="success" icon={<CheckCircleOutlined />} key="active">
                            {t('workspaces.active')}
                          </Tag>
                        ) : (
                          <Button
                            key="switch"
                            type="link"
                            icon={<SwapOutlined />}
                            onClick={() => handleSwitch(workspace.id)}
                          >
                            {t('workspaces.switch')}
                          </Button>
                        ),
                      ]}
                    >
                      <Card.Meta
                        title={workspace.name}
                        description={t('workspaces.members', { count: workspace._count?.members || 1 })}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}
        </>
      ),
    },
    {
      key: 'activity',
      label: (
        <span>
          <HistoryOutlined />
          {t('workspace.activity.title')}
        </span>
      ),
      disabled: !activeWorkspace,
      children: (
        <>
          <Title level={2}>{t('workspace.activity.title')}</Title>
          <Paragraph type="secondary">{t('workspace.activity.intro')}</Paragraph>
          <Table
            dataSource={activities}
            columns={activityColumns}
            rowKey="id"
            loading={loadingActivity}
            pagination={{ pageSize: 15 }}
          />
        </>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Tabs defaultActiveKey="list" items={items} />

        <Modal
          title={t('workspaces.create')}
          open={isModalOpen}
          onCancel={() => setIsModalOpen(false)}
          onOk={() => form.submit()}
          confirmLoading={submitting}
          okText={t('common.create')}
          cancelText={t('common.cancel')}
        >
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item
              name="name"
              label={t('workspaces.name')}
              rules={[{ required: true, message: t('workspaces.nameRequired') }]}
            >
              <Input placeholder={t('workspaces.name')} autoFocus />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
