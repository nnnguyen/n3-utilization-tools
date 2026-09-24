'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { useT, useFormat, type MessageKey } from '@/lib/i18n';

interface Topic {
  id: string;
  title: string;
  description: string | null;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  createdAt: string;
}

const STATUS_COLOR: Record<Topic['status'], string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  CLOSED: 'red',
};
const STATUS_LABEL: Record<Topic['status'], MessageKey> = {
  DRAFT: 'wc.statusDraft',
  ACTIVE: 'wc.statusActive',
  CLOSED: 'wc.statusClosed',
};

export default function DashboardPage() {
  const t = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    try {
      const data = await apiFetch('/topics');
      setTopics(data);
    } catch (error) {
      console.error('Load topics failed:', error);
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const handleCreate = async (values: { title: string; description?: string }) => {
    setCreating(true);
    try {
      const data = await apiFetch('/topics', { method: 'POST', body: JSON.stringify(values) });
      const { id } = data;
      message.success(t('wc.createSuccess'));
      setModalOpen(false);
      form.resetFields();
      router.push(`/word-cloud/topics/${id}/edit`);
    } catch (error) {
      message.error(t('wc.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (topic: Topic) => {
    setEditingTopic(topic);
    editForm.setFieldsValue({ title: topic.title, description: topic.description ?? '' });
  };

  const handleEditSubmit = async (values: { title: string; description?: string }) => {
    if (!editingTopic) return;
    setSavingEdit(true);
    try {
      const updated = await apiFetch(`/topics/${editingTopic.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      setTopics((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      message.success(t('wc.updated'));
      setEditingTopic(null);
    } catch (error) {
      message.error(t('wc.updateFailed'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (topic: Topic) => {
    const nextStatus = topic.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    setUpdatingStatusId(topic.id);
    try {
      const updated = await apiFetch(`/topics/${topic.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setTopics((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      message.success(nextStatus === 'ACTIVE' ? t('wc.activated') : t('wc.closed'));
    } catch (error) {
      message.error(t('wc.statusFailed'));
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/topics/${id}`, { method: 'DELETE' });
      message.success(t('wc.deleted'));
      await loadTopics();
    } catch (error) {
      message.error(t('wc.deleteFailed'));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <Card
        title={t('wc.topicList')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t('wc.createTopic')}
          </Button>
        }
      >
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="id"
            loading={loadingTopics}
            dataSource={topics}
            locale={{ emptyText: t('wc.noTopics') }}
            columns={[
              { title: t('field.title'), dataIndex: 'title' },
              { title: t('wc.colCode'), dataIndex: 'code' },
              {
                title: t('wc.colStatus'),
                dataIndex: 'status',
                render: (status: Topic['status']) => (
                  <Tag color={STATUS_COLOR[status]}>{t(STATUS_LABEL[status])}</Tag>
                ),
              },
              {
                title: t('wc.colCreated'),
                dataIndex: 'createdAt',
                render: (value: string) => fmt.dateTime(value),
              },
              {
                title: t('wc.colActions'),
                render: (_: unknown, record: Topic) => (
                  <Space>
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => router.push(`/word-cloud/topics/${record.id}/edit`)}
                      title={t('wc.viewQuestions')}
                    />
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditModal(record)}
                      title={t('common.edit')}
                    />
                    <Button
                      size="small"
                      loading={updatingStatusId === record.id}
                      onClick={() => handleToggleStatus(record)}
                      icon={
                        record.status === 'ACTIVE' ? (
                          <LockOutlined />
                        ) : record.status === 'CLOSED' ? (
                          <UnlockOutlined />
                        ) : (
                          <CheckOutlined />
                        )
                      }
                      title={
                        record.status === 'ACTIVE'
                          ? t('wc.close')
                          : record.status === 'CLOSED'
                            ? t('wc.reactivate')
                            : t('wc.activate')
                      }
                    />
                    <Popconfirm
                      title={t('wc.deleteConfirm')}
                      onConfirm={() => handleDelete(record.id)}
                      okText={t('common.delete')}
                      cancelText={t('common.cancel')}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} title={t('common.delete')} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
      </Card>

      <Modal
        title={t('wc.newTopic')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="title"
            label={t('field.title')}
            rules={[{ required: true, message: t('wc.titleRequired') }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label={t('field.description')}>
            <Input.TextArea maxLength={1000} rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('wc.editTopic')}
        open={editingTopic !== null}
        onCancel={() => setEditingTopic(null)}
        onOk={() => editForm.submit()}
        confirmLoading={savingEdit}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="title"
            label={t('field.title')}
            rules={[{ required: true, message: t('wc.titleRequired') }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label={t('field.description')}>
            <Input.TextArea maxLength={1000} rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
