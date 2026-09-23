'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, Button, Space, Steps, Alert, Spin, message } from 'antd';
import { 
  YoutubeOutlined, 
  VideoCameraOutlined, 
  CloudOutlined, 
  ArrowRightOutlined,
  SettingOutlined,
  LinkOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  HomeOutlined
} from '@ant-design/icons';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';

const { Title, Paragraph, Text } = Typography;

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [configs, setConfigs] = useState<any>(null);
  const [fetchingConfigs, setFetchingConfigs] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchConfigs = async () => {
      if (user) {
        try {
          const response = await apiFetch('/integrations/config');
          setConfigs(response);
        } catch (error) {
          console.error('Failed to fetch configs', error);
        } finally {
          setFetchingConfigs(false);
        }
      }
    };
    fetchConfigs();
  }, [user]);

  if (loading || !user) {
    return null;
  }

  const isZoomActive = configs?.zoom?.isActive && configs?.zoom?.clientId && configs?.zoom?.clientSecret;
  const isYoutubeActive = configs?.youtube?.isActive && configs?.youtube?.refreshToken;

  const gettingStartedSteps = [
    {
      title: 'Step 1',
      content: 'Configure API',
      status: (isZoomActive && isYoutubeActive ? 'finish' : (isZoomActive || isYoutubeActive ? 'process' : 'wait')) as 'finish' | 'process' | 'wait',
      icon: <SettingOutlined />,
    },
    {
      title: 'Step 2',
      content: 'Connect to YouTube',
      status: (isYoutubeActive ? 'finish' : (isZoomActive ? 'process' : 'wait')) as 'finish' | 'process' | 'wait',
      icon: <LinkOutlined />,
    },
    {
      title: 'Step 3',
      content: 'Ready to go',
      status: (isZoomActive && isYoutubeActive ? 'finish' : 'wait') as 'finish' | 'process' | 'wait',
      icon: <RocketOutlined />,
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2}>Utilization Tools</Title>
          <Paragraph>
            A powerful collection of tools to enhance your productivity with YouTube, Zoom, and more.
          </Paragraph>
        </div>
        <Row gutter={[24, 24]} style={{ display: 'flex' }}>
          <Col xs={24} md={8} style={{ display: 'flex' }}>
            <Card
                hoverable
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                title={<Space><YoutubeOutlined style={{ color: '#ff0000' }} /> YouTube</Space>}
                actions={[
                  <Link href="/youtube/dashboard" key="go">
                    <Button type="primary" style={{ backgroundColor: 'transparent', color: '#ff0000', borderColor: '#ff0000' }} icon={<ArrowRightOutlined />}>Explore</Button>
                  </Link>
                ]}
            >
              <div style={{ flex: 1 }}>
                <Paragraph>
                  Manage your YouTube channel, upload videos manually, and track your upload history.
                </Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  <li>OAuth2 Connection</li>
                  <li>Manual Uploader</li>
                  <li>Library Manager</li>
                </ul>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} style={{ display: 'flex' }}>
            <Card
                hoverable
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                title={<Space><VideoCameraOutlined style={{ color: '#2D8CFF' }} /> Zoom</Space>}
                actions={[
                  <Link href="/zoom-utilities" key="go">
                    <Button type="primary" style={{ backgroundColor: 'transparent', color: '#2D8CFF', borderColor: '#2D8CFF' }} icon={<ArrowRightOutlined />}>Explore</Button>
                  </Link>
                ]}
            >
              <div style={{ flex: 1 }}>
                <Paragraph>
                  Automate your Zoom workflow by automatically uploading recordings to YouTube.
                </Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  <li>Webhook Integration</li>
                  <li>Auto-upload Rules</li>
                  <li>Sync History Logs</li>
                </ul>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} style={{ display: 'flex' }}>
            <Card
                hoverable
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                title={<Space><CloudOutlined style={{ color: '#1890ff' }} /> Word Cloud</Space>}
                actions={[
                  <Link href="/word-cloud" key="go">
                    <Button icon={<ArrowRightOutlined />}>Explore</Button>
                  </Link>
                ]}
            >
              <div style={{ flex: 1 }}>
                <Paragraph>
                  Real-time audience engagement with live word clouds.
                </Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  <li>Real-time Voting</li>
                  <li>Dynamic Word Clouds</li>
                  <li>Presentation Mode</li>
                </ul>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Getting Started Section */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Title level={3}>Getting Started</Title>
          <Card>
            {fetchingConfigs ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Spin description="Checking integration status..." />
                </div>
            ) : (
                <Row gutter={[24, 24]} align="middle">
                  <Col md={24}>
                    <Steps
                        current={isZoomActive && isYoutubeActive ? 3 : (isYoutubeActive ? 2 : (isZoomActive ? 1 : 0))}
                        items={gettingStartedSteps}
                    />
                  </Col>
                  <Col md={24} style={{ textAlign: 'center' }}>
                    <Link href="/integrations">
                      <Button type="primary">Setup Integrations</Button>
                    </Link>
                  </Col>
                </Row>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
