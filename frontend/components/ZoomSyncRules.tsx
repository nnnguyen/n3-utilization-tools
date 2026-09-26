'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { captionLanguageLabel, captionLanguageOptions } from '@/lib/captions';

const { Text } = Typography;

interface SyncRule {
  id: string;
  position: number;
  matchText: string;
  titleTemplate: string | null;
  descriptionTemplate: string | null;
  playlistId: string | null;
  tags: string[];
  privacyStatus: 'public' | 'unlisted' | 'private' | null;
  publishDelayMinutes: number | null;
  captionLanguage: string | null;
}

// Topic rules of the Automation Workflow: the first rule whose text appears in
// the meeting name overrides the workflow settings for that recording
export default function ZoomSyncRules({ playlists }: { playlists: any[] }) {
  const t = useT();
  const { language } = usePreferences();
  const [rules, setRules] = useState<SyncRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SyncRule | 'new' | null>(null);
  // Kept while the dialog closes, so its title does not flip
  const [isNew, setIsNew] = useState(true);
  const [form] = Form.useForm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      setRules(await apiFetch('/zoom/sync-rules'));
    } catch (error: any) {
      message.error(t('zoomRules.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const openEditor = (rule: SyncRule | 'new') => {
    setEditing(rule);
    setIsNew(rule === 'new');
    form.resetFields();
    if (rule !== 'new') {
      form.setFieldsValue({
        ...rule,
        playlistId: rule.playlistId || '',
        privacyStatus: rule.privacyStatus || '',
        captionLanguage: rule.captionLanguage || '',
        publishDelayHours: rule.publishDelayMinutes === null ? null : rule.publishDelayMinutes / 60,
      });
    }
  };

  const onSave = async () => {
    const values = await form.validateFields();
    const body = {
      matchText: values.matchText,
      titleTemplate: values.titleTemplate || null,
      descriptionTemplate: values.descriptionTemplate || null,
      playlistId: values.playlistId || null,
      privacyStatus: values.privacyStatus || null,
      tags: values.tags || [],
      captionLanguage: values.captionLanguage || null,
      publishDelayMinutes:
        values.publishDelayHours === null || values.publishDelayHours === undefined
          ? null
          : Math.round(values.publishDelayHours * 60),
    };
    setSaving(true);
    try {
      if (editing === 'new') {
        await apiFetch('/zoom/sync-rules', { method: 'POST', body: JSON.stringify(body) });
      } else if (editing) {
        await apiFetch(`/zoom/sync-rules/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      message.success(t('zoomRules.saved'));
      setEditing(null);
      fetchRules();
    } catch (error: any) {
      message.error(error.message || t('zoomRules.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (rule: SyncRule) => {
    try {
      await apiFetch(`/zoom/sync-rules/${rule.id}`, { method: 'DELETE' });
      message.success(t('zoomRules.deleted'));
      fetchRules();
    } catch (error: any) {
      message.error(error.message || t('zoomRules.saveFailed'));
    }
  };

  const move = async (index: number, offset: number) => {
    const ids = rules.map(r => r.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved);
    try {
      setRules(await apiFetch('/zoom/sync-rules/order', { method: 'PUT', body: JSON.stringify({ ids }) }));
    } catch (error: any) {
      message.error(error.message || t('zoomRules.saveFailed'));
    }
  };

  const playlistTitle = (id: string) => playlists.find(p => p.id === id)?.title || id;

  const formatDelay = (minutes: number) =>
    minutes % 60 === 0
      ? t('zoomRules.delayHours', { hours: minutes / 60 })
      : t('zoomRules.delayMinutes', { minutes });

  const columns = [
    {
      title: t('zoomRules.order'),
      key: 'order',
      width: 90,
      render: (_: any, __: SyncRule, index: number) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label={t('zoomRules.moveUp')} disabled={index === 0} onClick={() => move(index, -1)} />
          <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label={t('zoomRules.moveDown')} disabled={index === rules.length - 1} onClick={() => move(index, 1)} />
        </Space>
      ),
    },
    {
      title: t('zoomRules.matchText'),
      dataIndex: 'matchText',
      key: 'matchText',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('zoomRules.applies'),
      key: 'applies',
      render: (_: any, rule: SyncRule) => (
        <Space orientation="vertical" size={2}>
          {rule.titleTemplate && <Text>{t('zoomRules.titleShort')}: <Text code>{rule.titleTemplate}</Text></Text>}
          {rule.playlistId && <Text>{t('field.playlist')}: {playlistTitle(rule.playlistId)}</Text>}
          {rule.publishDelayMinutes !== null ? (
            <Text>{formatDelay(rule.publishDelayMinutes)}</Text>
          ) : rule.privacyStatus ? (
            <Text>{t(`privacy.${rule.privacyStatus}` as 'privacy.public')}</Text>
          ) : null}
          {rule.captionLanguage && (
            <Text>{t('zoomRules.captionShort', { language: captionLanguageLabel(rule.captionLanguage, language) })}</Text>
          )}
          {rule.tags.length > 0 && (
            <div>{rule.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div>
          )}
          {!rule.titleTemplate && !rule.playlistId && rule.publishDelayMinutes === null && !rule.privacyStatus && rule.tags.length === 0 && rule.descriptionTemplate === null && !rule.captionLanguage && (
            <Text type="secondary">{t('zoomRules.nothingOverridden')}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: any, rule: SyncRule) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} aria-label={t('common.edit')} onClick={() => openEditor(rule)} />
          <Popconfirm title={t('zoomRules.deleteConfirm')} onConfirm={() => onDelete(rule)} okText={t('common.delete')} cancelText={t('common.cancel')}>
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<Space><FilterOutlined /><span>{t('zoomRules.title')}</span></Space>}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>{t('zoomRules.add')}</Button>}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{t('zoomRules.intro')}</Text>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rules}
        columns={columns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('zoomRules.empty') }}
      />

      <Modal
        title={isNew ? t('zoomRules.addTitle') : t('zoomRules.editTitle')}
        open={editing !== null}
        onOk={onSave}
        onCancel={() => setEditing(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('zoomRules.matchText')}
            name="matchText"
            extra={t('zoomRules.matchTextHelp')}
            rules={[{ required: true, whitespace: true, message: t('zoomRules.matchTextRequired') }, { max: 200 }]}
          >
            <Input placeholder="SOH" maxLength={200} />
          </Form.Item>
          <Form.Item label={t('zoomRules.titleTemplate')} name="titleTemplate" rules={[{ max: 200 }]}>
            <Input placeholder={t('zoomRules.useDefault')} maxLength={200} />
          </Form.Item>
          <Form.Item label={t('zoomRules.descriptionTemplate')} name="descriptionTemplate" rules={[{ max: 2000 }]}>
            <Input.TextArea placeholder={t('zoomRules.useDefault')} autoSize={{ minRows: 1, maxRows: 5 }} maxLength={2000} />
          </Form.Item>
          <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 16 }}>
            {t('zoomRules.placeholdersHelp')}
          </Text>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label={t('field.playlist')} name="playlistId" initialValue="">
                <Select showSearch optionFilterProp="label" options={[
                  { value: '', label: t('zoomRules.useDefault') },
                  ...playlists.map(p => ({ value: p.id, label: p.title })),
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('zoomRules.privacy')} name="privacyStatus" initialValue="">
                <Select options={[
                  { value: '', label: t('zoomRules.useDefault') },
                  { value: 'public', label: t('privacy.public') },
                  { value: 'unlisted', label: t('privacy.unlisted') },
                  { value: 'private', label: t('privacy.private') },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('zoomRules.publishDelay')} name="publishDelayHours" extra={t('zoomRules.publishDelayHelp')}>
            <InputNumber min={0} max={720} step={0.5} style={{ width: '100%' }} placeholder={t('zoomRules.noSchedule')} suffix={t('zoomRules.hours')} />
          </Form.Item>
          <Form.Item label={t('zoomRules.captionLanguage')} name="captionLanguage" initialValue="">
            <Select showSearch optionFilterProp="label" options={[
              { value: '', label: t('zoomRules.useDefault') },
              ...captionLanguageOptions(language, editing && editing !== 'new' ? editing.captionLanguage : null),
            ]} />
          </Form.Item>
          <Form.Item label={t('zoomRules.tags')} name="tags" initialValue={[]}>
            <Select mode="tags" tokenSeparators={[',']} placeholder={t('zoomRules.tagsPlaceholder')} open={false} suffixIcon={null} />
          </Form.Item>
          <Text type="secondary">{t('zoomRules.manualNote')}</Text>
        </Form>
      </Modal>
    </Card>
  );
}
