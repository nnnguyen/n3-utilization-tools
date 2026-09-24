'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Upload, Button, Spin, Alert, Typography, Space, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { apiFetch, API_URL } from '@/lib/api';
import { authHeaders } from '@/lib/auth-token';
import { translateNow, useT } from '@/lib/i18n';

const { Text } = Typography;

const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_TYPES = ['image/jpeg', 'image/png'];

export interface EditedVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: string;
  thumbnail?: string | null;
}

interface EditVideoModalProps {
  videoId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (video: EditedVideo) => void;
}

// apiFetch always sends Content-Type: application/json, which breaks multipart
// uploads, so the thumbnail goes through fetch directly.
async function uploadThumbnail(videoId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_URL}/youtube/videos/${videoId}/thumbnail`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(),
    credentials: 'include',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = data?.message;
    throw new Error((Array.isArray(msg) ? msg[0] : msg) || translateNow('editVideo.thumbUploadFailed', { status: response.status }));
  }
  return data as { thumbnail: string | null };
}

export default function EditVideoModal({ videoId, open, onClose, onSaved }: EditVideoModalProps) {
  const t = useT();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentThumbnail, setCurrentThumbnail] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoId) return;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      form.resetFields();
      setThumbnailFile(null);
      setThumbnailPreview(null);
      setCurrentThumbnail(null);
      try {
        const data = await apiFetch(`/youtube/videos/${videoId}`);
        form.setFieldsValue({
          title: data.title,
          description: data.description,
          tags: data.tags,
          privacyStatus: data.privacyStatus,
        });
        setCurrentThumbnail(data.thumbnail);
      } catch (error: any) {
        setLoadError(error.message || t('editVideo.loadFailed'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, videoId]);

  // Release the object URL used for the local preview
  useEffect(() => {
    return () => {
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    };
  }, [thumbnailPreview]);

  const handleSelectThumbnail = (file: File) => {
    if (!THUMBNAIL_TYPES.includes(file.type)) {
      message.error(t('editVideo.thumbType'));
      return Upload.LIST_IGNORE;
    }
    if (file.size > THUMBNAIL_MAX_BYTES) {
      message.error(t('editVideo.thumbSize'));
      return Upload.LIST_IGNORE;
    }
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
    return false;
  };

  const handleSave = async () => {
    if (!videoId) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await apiFetch(`/youtube/videos/${videoId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: values.title.trim(),
          description: values.description || '',
          tags: values.tags || [],
          privacyStatus: values.privacyStatus,
        }),
      });

      let thumbnail = currentThumbnail;
      if (thumbnailFile) {
        try {
          const result = await uploadThumbnail(videoId, thumbnailFile);
          thumbnail = result.thumbnail || thumbnail;
        } catch (error: any) {
          // Metadata is already saved; report the thumbnail failure on its own
          message.warning(t('editVideo.savedThumbFailed', { error: error.message }));
          onSaved?.({ ...updated, thumbnail });
          onClose();
          return;
        }
      }

      message.success(t('editVideo.updated'));
      onSaved?.({ ...updated, thumbnail });
      onClose();
    } catch (error: any) {
      message.error(error.message || t('editVideo.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('editVideo.title')}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText={t('common.save')}
      confirmLoading={saving}
      okButtonProps={{ disabled: loading || !!loadError }}
      width={640}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {loadError ? (
          <Alert type="error" title={loadError} showIcon />
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item
              label={t('field.title')}
              name="title"
              rules={[
                { required: true, whitespace: true, message: t('validation.titleRequired') },
                { max: 100, message: t('validation.maxChars', { field: t('field.title'), max: 100 }) },
              ]}
            >
              <Input showCount maxLength={100} />
            </Form.Item>
            <Form.Item
              label={t('field.description')}
              name="description"
              rules={[{ max: 5000, message: t('validation.maxChars', { field: t('field.description'), max: 5000 }) }]}
            >
              <Input.TextArea rows={4} showCount maxLength={5000} />
            </Form.Item>
            <Form.Item label={t('field.tags')} name="tags" extra={t('editVideo.tagsHint')}>
              <Select mode="tags" tokenSeparators={[',']} open={false} placeholder={t('editVideo.addTags')} />
            </Form.Item>
            <Form.Item label={t('field.privacyStatus')} name="privacyStatus">
              <Select>
                <Select.Option value="public">{t('privacy.public')}</Select.Option>
                <Select.Option value="unlisted">{t('privacy.unlisted')}</Select.Option>
                <Select.Option value="private">{t('privacy.private')}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item label={t('field.thumbnail')} extra={t('editVideo.thumbHint')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {(thumbnailPreview || currentThumbnail) ? (
                  <img
                    src={thumbnailPreview || currentThumbnail || undefined}
                    alt="thumbnail"
                    style={{ width: 160, borderRadius: 4, border: '1px solid var(--color-divider)' }}
                  />
                ) : (
                  <Text type="secondary">{t('editVideo.noThumbnail')}</Text>
                )}
                <Space>
                  <Upload accept="image/jpeg,image/png" showUploadList={false} beforeUpload={handleSelectThumbnail}>
                    <Button icon={<UploadOutlined />}>{t('editVideo.chooseImage')}</Button>
                  </Upload>
                  {thumbnailFile && (
                    <Button
                      type="link"
                      onClick={() => {
                        setThumbnailFile(null);
                        setThumbnailPreview(null);
                      }}
                    >
                      {t('common.undo')}
                    </Button>
                  )}
                </Space>
              </div>
            </Form.Item>
          </Form>
        )}
      </Spin>
    </Modal>
  );
}
