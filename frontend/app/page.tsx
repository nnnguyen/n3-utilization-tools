'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, Button, Space, Steps, Alert, Spin, message } from 'antd';
import { 
  CloudOutlined, 
  ArrowRightOutlined,
  SettingOutlined,
  LinkOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  HomeOutlined
} from '@ant-design/icons';
import { YoutubeLogo, ZoomLogo } from '../components/BrandLogos';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

const { Title, Paragraph, Text } = Typography;

export default function Home() {
  const t = useT();
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
      title: t('home.step', { n: 1 }),
      content: t('home.step1'),
      status: (isZoomActive && isYoutubeActive ? 'finish' : (isZoomActive || isYoutubeActive ? 'process' : 'wait')) as 'finish' | 'process' | 'wait',
      icon: <SettingOutlined />,
    },
    {
      title: t('home.step', { n: 2 }),
      content: t('home.step2'),
      status: (isYoutubeActive ? 'finish' : (isZoomActive ? 'process' : 'wait')) as 'finish' | 'process' | 'wait',
      icon: <LinkOutlined />,
    },
    {
      title: t('home.step', { n: 3 }),
      content: t('home.step3'),
      status: (isZoomActive && isYoutubeActive ? 'finish' : 'wait') as 'finish' | 'process' | 'wait',
      icon: <RocketOutlined />,
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2}>{t('home.title')}</Title>
          <Paragraph>
            {t('home.subtitle')}
          </Paragraph>
        </div>
        <Row gutter={[24, 24]} style={{ display: 'flex' }}>
          <Col xs={24} md={8} style={{ display: 'flex' }}>
            <Card
                hoverable
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                // Official full-color logo; it already reads "YouTube", so no extra label
                title={<YoutubeLogo height={20} />}
                actions={[
                  <Link href="/youtube/dashboard" key="go">
                    <Button type="primary" style={{ backgroundColor: 'transparent', color: '#ff0000', borderColor: '#ff0000' }} icon={<ArrowRightOutlined />}>{t('home.explore')}</Button>
                  </Link>
                ]}
            >
              <div style={{ flex: 1 }}>
                <Paragraph>
                  {t('home.ytDesc')}
                </Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  <li>{t('home.ytF1')}</li>
                  <li>{t('home.ytF2')}</li>
                  <li>{t('home.ytF3')}</li>
                </ul>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} style={{ display: 'flex' }}>
            <Card
                hoverable
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                // Official Zoom wordmark; it already reads "zoom", so no extra label
                title={<ZoomLogo height={16} />}
                actions={[
                  <Link href="/zoom-utilities" key="go">
                    <Button type="primary" style={{ backgroundColor: 'transparent', color: '#2D8CFF', borderColor: '#2D8CFF' }} icon={<ArrowRightOutlined />}>{t('home.explore')}</Button>
                  </Link>
                ]}
            >
              <div style={{ flex: 1 }}>
                <Paragraph>
                  {t('home.zoomDesc')}
                </Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  <li>{t('home.zoomF1')}</li>
                  <li>{t('home.zoomF2')}</li>
                  <li>{t('home.zoomF3')}</li>
                </ul>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} style={{ display: 'flex' }}>
            <Card
                hoverable
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                title={<Space><CloudOutlined style={{ color: 'var(--color-accent)' }} /> {t('nav.wordCloud')}</Space>}
                actions={[
                  <Link href="/word-cloud" key="go">
                    <Button icon={<ArrowRightOutlined />}>{t('home.explore')}</Button>
                  </Link>
                ]}
            >
              <div style={{ flex: 1 }}>
                <Paragraph>
                  {t('home.wcDesc')}
                </Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  <li>{t('home.wcF1')}</li>
                  <li>{t('home.wcF2')}</li>
                  <li>{t('home.wcF3')}</li>
                </ul>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Getting Started Section */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Title level={3}>{t('home.gettingStarted')}</Title>
          <Card>
            {fetchingConfigs ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Spin description={t('home.checking')} />
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
                    <Link href="/settings/integrations">
                      <Button type="primary">{t('home.setup')}</Button>
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
