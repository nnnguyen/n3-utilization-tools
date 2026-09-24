'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, theme, Avatar, Dropdown, Space, Typography } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  PlaySquareOutlined,
  BarChartOutlined,
  ApiOutlined,
  SkinOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';
import { WordCloudLogo, YoutubeLogo, ZoomLogo } from './BrandLogos';
import { useT } from '@/lib/i18n';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { user, logout, loading } = useAuth();
  
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: <Link href="/">{t('nav.home')}</Link>,
    },
    {
      key: 'utilities',
      icon: <AppstoreOutlined />,
      label: t('nav.utilities'),
      children: [
        {
          key: 'youtube',
          // Official logos replace icon + text (alt text keeps the item named).
          // These are second-level items, so the collapsed sidebar never shows them as bare icons.
          label: <YoutubeLogo height={16} />,
          children: [
            {
              key: '/youtube/dashboard',
              icon: <DashboardOutlined />,
              label: <Link href="/youtube/dashboard">{t('nav.dashboard')}</Link>,
            },
            {
              key: '/youtube/channel-content',
              icon: <PlaySquareOutlined />,
              label: <Link href="/youtube/channel-content">{t('nav.channelContent')}</Link>,
            },
            {
              key: '/youtube/analytics',
              icon: <BarChartOutlined />,
              label: <Link href="/youtube/analytics">{t('nav.analytics')}</Link>,
            },
          ],
        },
        {
          key: '/zoom-utilities',
          label: <Link href="/zoom-utilities"><ZoomLogo height={13} /></Link>,
        },
        {
          key: '/word-cloud/dashboard',
          label: <Link href="/word-cloud/dashboard"><WordCloudLogo height={15} /></Link>,
        },
      ]
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('nav.settings'),
      children: [
        {
          key: '/settings/integrations',
          icon: <ApiOutlined />,
          label: <Link href="/settings/integrations">{t('nav.integrations')}</Link>,
        },
        {
          key: '/settings/personalization',
          icon: <SkinOutlined />,
          label: <Link href="/settings/personalization">{t('nav.personalization')}</Link>,
        },
      ],
    },
  ];

  const userMenuItems = [
    {
      key: 'personalization',
      icon: <SkinOutlined />,
      label: t('nav.personalization'),
      onClick: () => router.push('/settings/personalization'),
    },
    {
      key: 'integrations',
      icon: <ApiOutlined />,
      label: t('nav.integrations'),
      onClick: () => router.push('/settings/integrations'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('nav.logout'),
      onClick: logout,
    },
  ];

  if (loading || !user) {
    return null;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 272px: "Channel Content" sits three menu levels deep; with the Broadsheet serif and 1.25x spacing it needs this much */}
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light" width={272}>
        <div className="demo-logo-vertical" style={{ height: 32, margin: 16, background: 'var(--color-surface)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
          {collapsed ? 'N3' : 'N3 Utils'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[pathname]}
          // Open the groups containing the current page so nested items are visible
          defaultOpenKeys={
            pathname.startsWith('/youtube')
              ? ['utilities', 'youtube']
              : ['/zoom-utilities', '/word-cloud'].some(p => pathname.startsWith(p))
                ? ['utilities']
                : pathname.startsWith('/settings')
                  ? ['settings']
                  : []
          }
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={t('nav.toggleSidebar')}
              style={{
                fontSize: '16px',
                width: 64,
                height: 64,
              }}
            />
            <h2 style={{ margin: 0 }}>{t('nav.dashboard')}</h2>
          </div>
          <Space size="middle">
            <LanguageSwitcher />
            <NotificationBell />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
                <Text>{user?.name || user?.email}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'initial'
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
