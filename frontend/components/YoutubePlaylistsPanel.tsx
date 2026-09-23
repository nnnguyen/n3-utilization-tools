'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Space, Button, Modal, Form, Input, Select, Popconfirm, Alert, Empty, Spin, message } from 'antd';
import { PlusOutlined, LinkOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, UnorderedListOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';

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

const PRIVACY_TAG: Record<string, { color: string; label: string }> = {
  public: { color: 'green', label: 'Public' },
  unlisted: { color: 'blue', label: 'Unlisted' },
  private: { color: 'orange', label: 'Private' },
};

const PrivacyTag = ({ value }: { value: string | null }) =>
  value ? <Tag color={PRIVACY_TAG[value]?.color}>{PRIVACY_TAG[value]?.label || value}</Tag> : <Text type="secondary">-</Text>;

// Channel Content → Playlists: list, create/edit/delete, and the videos in each playlist
export default function YoutubePlaylistsPanel({ connected, checking }: { connected: boolean; checking: boolean }) {
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
      setLoadError(error.message || 'Không tải được danh sách playlist');
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
        message.success('Đã cập nhật playlist');
      } else {
        await apiFetch('/youtube/playlists', { method: 'POST', body });
        message.success(`Đã tạo playlist "${values.title.trim()}"`);
      }
      setFormOpen(false);
      fetchPlaylists();
    } catch (error: any) {
      message.error(error.message || 'Không lưu được playlist');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (playlist: Playlist) => {
    Modal.confirm({
      title: `Xoá playlist "${playlist.title}"?`,
      content: 'Xoá playlist này sẽ không xoá video, chỉ xoá playlist. Các video vẫn còn trên kênh YouTube. Không thể hoàn tác.',
      okText: 'Xoá playlist',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await apiFetch(`/youtube/playlists/${playlist.id}`, { method: 'DELETE' });
          message.success('Đã xoá playlist');
          fetchPlaylists();
        } catch (error: any) {
          message.error(error.message || 'Không xoá được playlist');
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
      setItemsError(error.message || 'Không tải được danh sách video');
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
      message.success('Đã gỡ video khỏi playlist');
      setItems(prev => prev.filter(i => i.playlistItemId !== item.playlistItemId));
      setPlaylists(prev => prev.map(p => p.id === viewing.id ? { ...p, itemCount: Math.max(0, p.itemCount - 1) } : p));
    } catch (error: any) {
      message.error(error.message || 'Không gỡ được video khỏi playlist');
    } finally {
      setRemovingId(null);
    }
  };

  const columns = [
    {
      title: 'Tên playlist',
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
      title: 'Số video',
      dataIndex: 'itemCount',
      key: 'itemCount',
      align: 'right' as const,
      sorter: (a: Playlist, b: Playlist) => a.itemCount - b.itemCount,
    },
    {
      title: 'Privacy',
      dataIndex: 'privacyStatus',
      key: 'privacyStatus',
      render: (value: string | null) => <PrivacyTag value={value} />,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      sorter: (a: Playlist, b: Playlist) => (a.publishedAt || '').localeCompare(b.publishedAt || ''),
      render: (date: string | null) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Playlist) => (
        <Space>
          <Button size="small" icon={<UnorderedListOutlined />} onClick={() => openItems(record)}>
            View details
          </Button>
          <Button size="small" icon={<LinkOutlined />} href={`https://www.youtube.com/playlist?list=${record.id}`} target="_blank">
            View on YouTube
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const itemColumns = [
    {
      title: 'Thumbnail',
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      width: 120,
      render: (url: string | null) => url
        ? <img src={url} alt="thumbnail" style={{ width: 100, borderRadius: 4 }} />
        : <div style={{ width: 100, height: 56, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>No Image</div>,
    },
    {
      title: 'Title',
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
          title="Gỡ video khỏi playlist?"
          description="Video vẫn còn trên kênh, chỉ bị gỡ khỏi playlist này."
          onConfirm={() => removeItem(item)}
          okText="Gỡ"
          okButtonProps={{ danger: true }}
          cancelText="Huỷ"
        >
          <Button size="small" danger icon={<MinusCircleOutlined />} loading={removingId === item.playlistItemId}>
            Remove from playlist
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
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!isConnected}>
            Create Playlist
          </Button>
        </Space>
      </div>

      {loadError && <Alert type="error" title={loadError} showIcon style={{ marginBottom: 16 }} />}

      <Table
        columns={columns}
        dataSource={playlists}
        rowKey="id"
        loading={loading || checking}
        locale={{ emptyText: isConnected ? 'Kênh chưa có playlist nào' : 'Kết nối YouTube để xem danh sách playlist' }}
      />

      <Modal
        title={editing ? 'Edit Playlist' : 'Create Playlist'}
        open={formOpen}
        onCancel={() => !saving && setFormOpen(false)}
        onOk={handleSave}
        okText={editing ? 'Save' : 'Create'}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ privacyStatus: 'private' }} preserve={false}>
          <Form.Item
            label="Tên playlist"
            name="title"
            rules={[
              { required: true, whitespace: true, message: 'Vui lòng nhập tên playlist' },
              { max: 150, message: 'Tên playlist tối đa 150 ký tự' },
            ]}
          >
            <Input showCount maxLength={150} placeholder="Nhập tên playlist" />
          </Form.Item>
          <Form.Item label="Mô tả" name="description" rules={[{ max: 5000, message: 'Mô tả tối đa 5000 ký tự' }]}>
            <Input.TextArea rows={3} showCount maxLength={5000} placeholder="Mô tả (không bắt buộc)" />
          </Form.Item>
          <Form.Item label="Privacy Status" name="privacyStatus">
            <Select>
              <Select.Option value="public">Public</Select.Option>
              <Select.Option value="unlisted">Unlisted</Select.Option>
              <Select.Option value="private">Private</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={viewing ? `Video trong "${viewing.title}"` : ''}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={[<Button key="close" onClick={() => setViewing(null)}>Close</Button>]}
        width={760}
      >
        {itemsError ? (
          <Alert type="error" title={itemsError} showIcon />
        ) : (
          <Spin spinning={itemsLoading}>
            {!itemsLoading && items.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có video nào trong playlist này" />
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
