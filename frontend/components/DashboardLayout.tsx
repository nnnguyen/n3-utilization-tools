'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, theme, Avatar, Dropdown, Space, Typography, Drawer, Grid, MenuProps } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
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
  SafetyCertificateOutlined,
  KeyOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useWorkspaces } from '@/lib/workspaces/workspace-context';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';
import { WordCloudLogo, YoutubeLogo, ZoomLogo } from './BrandLogos';
import { N3ConnectLockup, N3ConnectMark } from './N3ConnectLogo';
import { useT } from '@/lib/i18n';
import { pageTitleKey } from '@/lib/page-title';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  // Phones and portrait tablets (below antd's lg, 992px): the menu is a drawer
  const screens = Grid.useBreakpoint();
  const isCompact = !screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { user, logout, loading } = useAuth();
  const { activeWorkspace, workspaces, switchWorkspace } = useWorkspaces();
  
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user?.mustChangePassword) {
      // A temp password must be replaced before any page works
      router.replace('/change-password');
    }
  }, [user, loading, router]);

  // A page opened from the drawer closes it
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: <Link href="/">{t('nav.home')}</Link>,
    },
    {
      key: 'utilities',
      icon: <AppstoreOutlined />,
      label: t('nav.apps'),
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
        {
          key: '/utilities/qr-generator',
          icon: <QrcodeOutlined />,
          label: <Link href="/utilities/qr-generator">{t('nav.qrGenerator')}</Link>,
        },
      ]
    },
    ...(user?.platformRole === 'super_admin'
      ? [{
          key: '/admin',
          icon: <SafetyCertificateOutlined />,
          label: <Link href="/admin">{t('nav.admin')}</Link>,
        }]
      : []),
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
          key: '/settings/workspaces',
          icon: <UserOutlined />,
          label: <Link href="/settings/workspaces">{t('nav.workspaces')}</Link>,
        },
        {
          key: '/settings/personalization',
          icon: <SkinOutlined />,
          label: <Link href="/settings/personalization">{t('nav.personalization')}</Link>,
        },
      ],
    },
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'workspaces',
      label: (
        <Space orientation="vertical" size={0} style={{ width: '100%', marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('nav.activeWorkspace')}</Text>
          <Dropdown
            trigger={['click']}
            menu={{
              items: workspaces.map(w => ({
                key: w.id,
                label: w.name,
                disabled: w.id === activeWorkspace?.id,
                onClick: () => switchWorkspace(w.id),
              }))
            }}
          >
            <Button block style={{ textAlign: 'left', padding: '4px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text ellipsis>{activeWorkspace?.name}</Text>
                <MenuUnfoldOutlined style={{ fontSize: 12 }} />
              </div>
            </Button>
          </Dropdown>
        </Space>
      ),
    },
    { type: 'divider' },
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
      key: 'change-password',
      icon: <KeyOutlined />,
      label: t('nav.changePassword'),
      onClick: () => router.push('/change-password'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('nav.logout'),
      onClick: logout,
    },
  ];

  if (loading || !user || user.mustChangePassword) {
    return null;
  }

  // Sidebar and drawer share the logo and the menu; the mark alone when the sidebar is collapsed
  const iconOnly = collapsed && !isCompact;
  const navigation = (
    <>
      {/* The app's logo with its slogan leads home. The lockup spans the sidebar (272px less 20px each side) */}
      <Link
        href="/"
        style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: iconOnly ? 'center' : 'flex-start', padding: iconOnly ? 0 : '0 20px' }}
      >
        {iconOnly ? <N3ConnectMark size={32} /> : <N3ConnectLockup height={44} />}
      </Link>
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
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isCompact ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          size={288}
          styles={{ body: { padding: 0 } }}
        >
          {navigation}
        </Drawer>
      ) : (
        // 272px: "Channel Content" sits three menu levels deep; with the Broadsheet serif and 1.25x spacing it needs this much
        <Sider trigger={null} collapsible collapsed={collapsed} theme="light" width={272}>
          {navigation}
        </Sider>
      )}
      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            padding: isCompact ? '0 8px' : '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <Button
              type="text"
              icon={isCompact ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => (isCompact ? setDrawerOpen(true) : setCollapsed(!collapsed))}
              aria-label={t('nav.toggleSidebar')}
              style={{
                fontSize: '16px',
                width: isCompact ? 48 : 64,
                height: isCompact ? 48 : 64,
              }}
            />
            {/* Without the sidebar, the mark keeps the brand (and the way home) in view */}
            {isCompact ? (
              <Link href="/" aria-label="N3 Connect"><N3ConnectMark size={32} /></Link>
            ) : (
              <h2 style={{ margin: 0 }}>{t(pageTitleKey(pathname))}</h2>
            )}
          </div>
          <Space size={isCompact ? 'small' : 'middle'}>
            <LanguageSwitcher />
            <NotificationBell />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
                {/* The name only where there is room for it; the avatar opens the same menu */}
                {screens.md && <Text>{user?.name || user?.email}</Text>}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: isCompact ? '8px' : '24px 16px',
            padding: screens.sm ? 24 : 12,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'initial',
            minWidth: 0,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
