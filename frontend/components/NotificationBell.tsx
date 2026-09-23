'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Dropdown, Empty, List, Switch, Typography, message, notification } from 'antd';
import { BellOutlined, CheckCircleTwoTone, CloseCircleTwoTone } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { apiFetch } from '@/lib/api';

const { Text } = Typography;

const POLL_INTERVAL_MS = 30_000;

interface AppNotification {
  id: string;
  type: 'sync_completed' | 'sync_failed';
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

interface EmailPreferences {
  notifyEmailOnCompleted: boolean;
  notifyEmailOnFailed: boolean;
  emailConfigured: boolean;
}

export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  // null until the first load, so existing notifications don't pop up as toasts
  const seenIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/notifications', { silent: true });
      const list: AppNotification[] = data.items || [];

      if (seenIds.current) {
        list
          .filter(n => !n.read && !seenIds.current!.has(n.id))
          .forEach(n => {
            const show = n.type === 'sync_completed' ? notification.success : notification.error;
            show({ title: n.title, description: n.message, placement: 'topRight' });
          });
      }
      seenIds.current = new Set(list.map(n => n.id));

      setItems(list);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Silent: the bell must never break the page
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Preferences are only needed once the panel is opened
  useEffect(() => {
    if (!open || prefs) return;
    apiFetch('/notifications/preferences', { silent: true })
      .then(setPrefs)
      .catch(() => undefined);
  }, [open, prefs]);

  const updatePref = async (key: 'notifyEmailOnCompleted' | 'notifyEmailOnFailed', value: boolean) => {
    const previous = prefs;
    setPrefs(p => (p ? { ...p, [key]: value } : p));
    try {
      const data = await apiFetch('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
        silent: true,
      });
      setPrefs(data);
    } catch {
      setPrefs(previous);
      message.error('Không lưu được cài đặt email');
    }
  };

  const openNotification = async (n: AppNotification) => {
    if (!n.read) {
      setItems(prev => prev.map(i => (i.id === n.id ? { ...i, read: true } : i)));
      setUnreadCount(c => Math.max(0, c - 1));
      apiFetch(`/notifications/${n.id}/read`, { method: 'PATCH', silent: true }).catch(() => undefined);
    }
    if (n.link) {
      setOpen(false);
      if (n.link.startsWith('http')) {
        window.open(n.link, '_blank', 'noopener,noreferrer');
      } else {
        router.push(n.link);
      }
    }
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(i => ({ ...i, read: true })));
    setUnreadCount(0);
    apiFetch('/notifications/read-all', { method: 'POST', silent: true }).catch(() => undefined);
  };

  const panel = (
    <div style={{ width: 360, background: '#fff', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Text strong>Notifications</Text>
        <Button type="link" size="small" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all as read
        </Button>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications" style={{ padding: 16 }} />
        ) : (
          <List
            dataSource={items}
            renderItem={(n) => (
              <List.Item
                onClick={() => openNotification(n)}
                style={{ padding: '10px 16px', cursor: 'pointer', background: n.read ? undefined : '#e6f4ff' }}
              >
                <List.Item.Meta
                  avatar={n.type === 'sync_completed'
                    ? <CheckCircleTwoTone twoToneColor="#52c41a" />
                    : <CloseCircleTwoTone twoToneColor="#ff4d4f" />}
                  title={n.title}
                  description={
                    <>
                      <div>{n.message}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(n.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
      <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 16px' }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Gửi thêm qua email</Text>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 13 }}>Khi video sẵn sàng</Text>
          <Switch
            size="small"
            loading={!prefs}
            checked={prefs?.notifyEmailOnCompleted ?? false}
            onChange={(v) => updatePref('notifyEmailOnCompleted', v)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 13 }}>Khi sync thất bại</Text>
          <Switch
            size="small"
            loading={!prefs}
            checked={prefs?.notifyEmailOnFailed ?? false}
            onChange={(v) => updatePref('notifyEmailOnFailed', v)}
          />
        </div>
        {prefs && !prefs.emailConfigured && (
          <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            Server chưa cấu hình SMTP (MAIL_USER / MAIL_PASS) nên email chưa được gửi.
          </Text>
        )}
      </div>
    </div>
  );

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomRight" popupRender={() => panel}>
      <Badge count={unreadCount} size="small" offset={[-4, 4]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Notifications" />
      </Badge>
    </Dropdown>
  );
}
