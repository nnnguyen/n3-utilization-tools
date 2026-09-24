'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Space, Button, Modal, Form, Input, Select, Popconfirm, Alert, Empty, Spin, message } from 'antd';
import { PlusOutlined, LinkOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, UnorderedListOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { useFormat, useT, type MessageKey } from '@/lib/i18n';

const { Text } = Typography;

interface Playlist {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  privacyStatus: 'public' | 'unlisted' | 'private' | null;
  publishedAt: string | null;
  thumbnail: string | null;
}

interface PlaylistItem {
  playlistItemId: string;
  videoId: string;
  title: string;
  thumbnail: string | null;
  position: number | null;
  privacyStatus: string | null;
}

const PRIVACY_TAG: Record<string, { color: string; label: MessageKey }> = {
  public: { color: 'green', label: 'privacy.public' },
  unlisted: { color: 'blue', label: 'privacy.unlisted' },
  private: { color: 'orange', label: 'privacy.private' },
};

function PrivacyTag({ value }: { value: string | null }) {
  const t = useT();
  return value
    ? <Tag color={PRIVACY_TAG[value]?.color}>{PRIVACY_TAG[value] ? t(PRIVACY_TAG[value].label) : value}</Tag>
    : <Text type="secondary">-</Text>;
}

// Channel Content → Playlists: list, create/edit/delete, and the videos in each playlist
export default function YoutubePlaylistsPanel({ connected, checking }: { connected: boolean; checking: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create / edit dialog (editing === null means create)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Videos-in-playlist dialog
  const [viewing, setViewing] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isConnected = connected;

  const fetchPlaylists = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch('/youtube/playlists');
      setPlaylists(data);
    } catch (error: any) {
      setLoadError(error.message || t('playlists.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) fetchPlaylists();
  }, [connected]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (playlist: Playlist) => {
    setEditing(playlist);
    form.setFieldsValue({
      title: playlist.title,
      description: playlist.description,
      privacyStatus: playlist.privacyStatus || 'private',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body = JSON.stringify({
        title: values.title.trim(),
        description: values.description || '',
        privacyStatus: values.privacyStatus,
      });
      if (editing) {
        await apiFetch(`/youtube/playlists/${editing.id}`, { method: 'PATCH', body });
        message.success(t('playlists.updated'));
      } else {
        await apiFetch('/youtube/playlists', { method: 'POST', body });
        message.success(t('playlists.created', { title: values.title.trim() }));
      }
      setFormOpen(false);
      fetchPlaylists();
    } catch (error: any) {
      message.error(error.message || t('playlists.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (playlist: Playlist) => {
    Modal.confirm({
      title: t('playlists.deleteTitle', { title: playlist.title }),
      content: t('playlists.deleteContent'),
      okText: t('playlists.deleteOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await apiFetch(`/youtube/playlists/${playlist.id}`, { method: 'DELETE' });
          message.success(t('playlists.deleted'));
          fetchPlaylists();
        } catch (error: any) {
          message.error(error.message || t('playlists.deleteFailed'));
          // A playlist already deleted in YouTube Studio should disappear from the list
          fetchPlaylists();
        }
      },
    });
  };

  const fetchItems = async (playlist: Playlist) => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const data = await apiFetch(`/youtube/playlists/${playlist.id}/items`);
      setItems(data);
    } catch (error: any) {
      setItems([]);
      setItemsError(error.message || t('playlists.itemsLoadFailed'));
    } finally {
      setItemsLoading(false);
    }
  };

  const openItems = (playlist: Playlist) => {
    setViewing(playlist);
    setItems([]);
    fetchItems(playlist);
  };

  const removeItem = async (item: PlaylistItem) => {
    if (!viewing) return;
    setRemovingId(item.playlistItemId);
    try {
      await apiFetch(`/youtube/playlists/${viewing.id}/items/${item.playlistItemId}`, { method: 'DELETE' });
      message.success(t('playlists.itemRemoved'));
      setItems(prev => prev.filter(i => i.playlistItemId !== item.playlistItemId));
      setPlaylists(prev => prev.map(p => p.id === viewing.id ? { ...p, itemCount: Math.max(0, p.itemCount - 1) } : p));
    } catch (error: any) {
      message.error(error.message || t('playlists.itemRemoveFailed'));
    } finally {
      setRemovingId(null);
    }
  };

  const columns = [
    {
      title: t('playlists.colName'),
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Playlist) => (
        <Space>
          {record.thumbnail && <img src={record.thumbnail} alt="" style={{ width: 64, borderRadius: 4 }} />}
          <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openItems(record)}>
            {title}
          </Button>
        </Space>
      ),
    },
    {
      title: t('playlists.colCount'),
      dataIndex: 'itemCount',
      key: 'itemCount',
      align: 'right' as const,
      sorter: (a: Playlist, b: Playlist) => a.itemCount - b.itemCount,
    },
    {
      title: t('playlists.colPrivacy'),
      dataIndex: 'privacyStatus',
      key: 'privacyStatus',
      render: (value: string | null) => <PrivacyTag value={value} />,
    },
    {
      title: t('playlists.colCreated'),
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      sorter: (a: Playlist, b: Playlist) => (a.publishedAt || '').localeCompare(b.publishedAt || ''),
      render: (date: string | null) => date ? fmt.date(date) : '-',
    },
    {
      title: t('col.actions'),
      key: 'actions',
      render: (_: any, record: Playlist) => (
        <Space>
          <Button size="small" icon={<UnorderedListOutlined />} onClick={() => openItems(record)}>
            {t('playlists.viewDetails')}
          </Button>
          <Button size="small" icon={<LinkOutlined />} href={`https://www.youtube.com/playlist?list=${record.id}`} target="_blank">
            {t('common.viewOnYouTube')}
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const itemColumns = [
    {
      title: t('col.thumbnail'),
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      width: 120,
      render: (url: string | null) => url
        ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} />
        : <div style={{ width: 100, height: 56, background: 'var(--color-divider)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{t('common.noImage')}</div>,
    },
    {
      title: t('col.title'),
      dataIndex: 'title',
      key: 'title',
      render: (title: string, item: PlaylistItem) => (
        <Space orientation="vertical" size={0}>
          <a href={`https://www.youtube.com/watch?v=${item.videoId}`} target="_blank" rel="noreferrer">{title}</a>
          <PrivacyTag value={item.privacyStatus} />
        </Space>
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 190,
      render: (_: any, item: PlaylistItem) => (
        <Popconfirm
          title={t('playlists.removeConfirm')}
          description={t('playlists.removeConfirmDesc')}
          onConfirm={() => removeItem(item)}
          okText={t('playlists.removeOk')}
          okButtonProps={{ danger: true }}
          cancelText={t('common.cancel')}
        >
          <Button size="small" danger icon={<MinusCircleOutlined />} loading={removingId === item.playlistItemId}>
            {t('playlists.removeFromPlaylist')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchPlaylists} loading={loading} disabled={!isConnected}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!isConnected}>
            {t('playlists.createPlaylist')}
          </Button>
        </Space>
      </div>

      {loadError && <Alert type="error" title={loadError} showIcon style={{ marginBottom: 16 }} />}

      <Table
        columns={columns}
        dataSource={playlists}
        rowKey="id"
        loading={loading || checking}
        locale={{ emptyText: isConnected ? t('playlists.emptyConnected') : t('playlists.emptyNotConnected') }}
      />

      <Modal
        title={editing ? t('playlists.editPlaylist') : t('playlists.createPlaylist')}
        open={formOpen}
        onCancel={() => !saving && setFormOpen(false)}
        onOk={handleSave}
        okText={editing ? t('common.save') : t('common.create')}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ privacyStatus: 'private' }} preserve={false}>
          <Form.Item
            label={t('playlists.colName')}
            name="title"
            rules={[
              { required: true, whitespace: true, message: t('playlists.nameRequired') },
              { max: 150, message: t('validation.maxChars', { field: t('playlists.colName'), max: 150 }) },
            ]}
          >
            <Input showCount maxLength={150} placeholder={t('playlists.namePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('field.description')} name="description" rules={[{ max: 5000, message: t('validation.maxChars', { field: t('field.description'), max: 5000 }) }]}>
            <Input.TextArea rows={3} showCount maxLength={5000} placeholder={t('playlists.descriptionPlaceholder')} />
          </Form.Item>
          <Form.Item label={t('field.privacyStatus')} name="privacyStatus">
            <Select>
              <Select.Option value="public">{t('privacy.public')}</Select.Option>
              <Select.Option value="unlisted">{t('privacy.unlisted')}</Select.Option>
              <Select.Option value="private">{t('privacy.private')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={viewing ? t('playlists.videosIn', { title: viewing.title }) : ''}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={[<Button key="close" onClick={() => setViewing(null)}>{t('common.close')}</Button>]}
        width={760}
      >
        {itemsError ? (
          <Alert type="error" title={itemsError} showIcon />
        ) : (
          <Spin spinning={itemsLoading}>
            {!itemsLoading && items.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('playlists.noVideos')} />
            ) : (
              <Table
                size="small"
                columns={itemColumns}
                dataSource={items}
                rowKey="playlistItemId"
                pagination={items.length > 10 ? { pageSize: 10 } : false}
              />
            )}
          </Spin>
        )}
      </Modal>
    </>
  );
}
