'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, theme, Avatar, Dropdown, Space, Typography } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  YoutubeOutlined,
  VideoCameraOutlined,
  CloudOutlined,
  HomeOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
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
      label: <Link href="/">Home</Link>,
    },
    {
      key: '/youtube-utilities',
      icon: <YoutubeOutlined />,
      label: <Link href="/youtube-utilities">YouTube Utils</Link>,
    },
    {
      key: '/zoom-utilities',
      icon: <VideoCameraOutlined />,
      label: <Link href="/zoom-utilities">Zoom Utils</Link>,
    },
    {
      key: '/word-cloud/dashboard',
      icon: <CloudOutlined />,
      label: <Link href="/word-cloud/dashboard">Word Cloud</Link>,
    },
    {
      key: '/integrations',
      icon: <SettingOutlined />,
      label: <Link href="/integrations">Integrations</Link>,
    },
  ];

  const userMenuItems = [
    {
      key: 'integrations',
      icon: <SettingOutlined />,
      label: 'Integrations',
      onClick: () => router.push('/integrations'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: logout,
    },
  ];

  if (loading || !user) {
    return null;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light">
        <div className="demo-logo-vertical" style={{ height: 32, margin: 16, background: 'rgba(0, 0, 0, 0.05)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
          {collapsed ? 'N3' : 'N3 Utils'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[pathname]}
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
              style={{
                fontSize: '16px',
                width: 64,
                height: 64,
              }}
            />
            <h2 style={{ margin: 0 }}>Dashboard</h2>
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
              <Text>{user?.name || user?.email}</Text>
            </Space>
          </Dropdown>
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
