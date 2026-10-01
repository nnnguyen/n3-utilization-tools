'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Breadcrumb, Button, Space, Modal, Input, message, Typography, Empty } from 'antd';
import { 
  FolderOutlined, 
  FileOutlined, 
  ArrowLeftOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  EditOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { useT as useTranslation } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import dayjs from 'dayjs';

const { Text } = Typography;

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  mimeType: string;
  size: number | null;
  updatedAt: string;
}

interface FileExplorerProps {
  provider: 'google_drive' | 'onedrive';
  onSelectFolder?: (folderId: string, folderName: string) => void;
  selectable?: boolean;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ 
  provider, 
  onSelectFolder, 
  selectable = false 
}) => {
  const t = useTranslation();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);

  const fetchFiles = useCallback(async (folderId?: string) => {
    setLoading(true);
    try {
      const endpoint = `/connections/${provider}/files${folderId ? `?folderId=${folderId}` : ''}`;
      const data = await apiFetch(endpoint);
      setFiles(data);
      setCurrentFolderId(folderId);
    } catch (error) {
      message.error(t('common.genericError'));
    } finally {
      setLoading(false);
    }
  }, [provider, t]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleFolderClick = (folder: FileItem) => {
    const newPath = [...path, { id: folder.id, name: folder.name }];
    setPath(newPath);
    fetchFiles(folder.id);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setPath([]);
      fetchFiles();
    } else {
      const newPath = path.slice(0, index + 1);
      setPath(newPath);
      fetchFiles(newPath[newPath.length - 1].id);
    }
  };

  const handleCreateFolder = () => {
    let folderName = '';
    Modal.confirm({
      title: t('explorer.createFolder'),
      content: (
        <Input 
          placeholder={t('workspaces.nameRequired')} 
          onChange={(e) => folderName = e.target.value} 
        />
      ),
      onOk: async () => {
        if (!folderName) return;
        try {
          await apiFetch(`/connections/${provider}/folders`, {
            method: 'POST',
            body: JSON.stringify({ name: folderName, parentId: currentFolderId }),
          });
          message.success(t('explorer.createSuccess'));
          fetchFiles(currentFolderId);
        } catch (error) {
          message.error(t('common.genericError'));
        }
      },
    });
  };

  const handleDelete = (file: FileItem) => {
    Modal.confirm({
      title: t('explorer.delete'),
      content: t('explorer.deleteConfirm', { name: file.name }),
      okType: 'danger',
      onOk: async () => {
        try {
          await apiFetch(`/connections/${provider}/files/${file.id}`, {
            method: 'DELETE',
          });
          message.success(t('explorer.deleteSuccess'));
          fetchFiles(currentFolderId);
        } catch (error) {
          message.error(t('common.genericError'));
        }
      },
    });
  };

  const handleRename = (file: FileItem) => {
    let newName = file.name;
    Modal.confirm({
      title: t('explorer.rename'),
      content: (
        <Input 
          defaultValue={file.name}
          onChange={(e) => newName = e.target.value} 
        />
      ),
      onOk: async () => {
        if (!newName || newName === file.name) return;
        try {
          await apiFetch(`/connections/${provider}/files/${file.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: newName }),
          });
          message.success(t('explorer.renameSuccess'));
          fetchFiles(currentFolderId);
        } catch (error) {
          message.error(t('common.genericError'));
        }
      },
    });
  };

  const columns = [
    {
      title: t('explorer.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: FileItem) => (
        <Space onClick={() => record.type === 'folder' ? handleFolderClick(record) : null} style={{ cursor: record.type === 'folder' ? 'pointer' : 'default' }}>
          {record.type === 'folder' ? <FolderOutlined style={{ color: '#faad14' }} /> : <FileOutlined />}
          <Text strong={record.type === 'folder'}>{text}</Text>
        </Space>
      ),
    },
    {
      title: t('explorer.size'),
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number | null) => size ? formatBytes(size) : '-',
    },
    {
      title: t('explorer.updatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('explorer.actions'),
      key: 'actions',
      width: 150,
      render: (_: any, record: FileItem) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleRename(record)} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
          {selectable && record.type === 'folder' && (
            <Button type="primary" size="small" onClick={() => onSelectFolder?.(record.id, record.name)}>
              {t('common.save')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="file-explorer">
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Breadcrumb
            items={[
              { title: (
                <Space>
                  <a onClick={() => handleBreadcrumbClick(-1)}>{t('explorer.root')}</a>
                  {provider === 'onedrive' && (
                    <Text type="secondary" style={{ fontSize: '12px' }}>({t('explorer.appRoot')})</Text>
                  )}
                </Space>
              ) },
              ...path.map((p, i) => ({
                title: <a onClick={() => handleBreadcrumbClick(i)}>{p.name}</a>
              }))
            ]}
          />
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => fetchFiles(currentFolderId)} />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateFolder}>
              {t('explorer.createFolder')}
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={files}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description={t('explorer.empty')} /> }}
          footer={() => (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              * {provider === 'google_drive' ? t('explorer.scopeNoticeGoogle') : t('explorer.scopeNotice')}
            </Text>
          )}
        />
      </Space>
    </div>
  );
};
