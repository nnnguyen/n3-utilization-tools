'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, Button, Steps, Alert, Spin, message } from 'antd';
import { 
  ArrowRightOutlined,
  SettingOutlined,
  LinkOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  HomeOutlined
} from '@ant-design/icons';
import { WordCloudLogo, YoutubeLogo, ZoomLogo } from '../components/BrandLogos';
import { N3ConnectLockup } from '../components/N3ConnectLogo';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

const { Title, Paragraph, Text } = Typography;

// One tool on the home page. The whole card opens the tool: the "Explore"
// link stretches over the card (globals.css .tool-card-cta), so it stays a
// single link rather than a clickable box around one
function ToolCard({ href, logo, description, features }: {
  href: string;
  logo: React.ReactNode;
  description: string;
  features: string[];
}) {
  const t = useT();
  return (
    <Col xs={24} md={8} style={{ display: 'flex' }}>
      <Card
        hoverable
        className="tool-card"
        style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
        title={logo}
      >
        <div style={{ flex: 1 }}>
          <Paragraph>{description}</Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        </div>
        <Link href={href} className="tool-card-cta">
          {t('home.explore')}
          <ArrowRightOutlined className="tool-card-cta-arrow" />
        </Link>
      </Card>
    </Col>
  );
}

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
          {/* The logo with its slogan (the slogan is part of the lockup's artwork) */}
          <Title level={1} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 32px' }}>
            <N3ConnectLockup height={76} />
          </Title>
        </div>
        <Row gutter={[24, 24]} style={{ display: 'flex' }}>
          <ToolCard
            href="/youtube/dashboard"
            // Official full-color logo; it already reads "YouTube", so no extra label
            logo={<YoutubeLogo height={20} />}
            description={t('home.ytDesc')}
            features={[t('home.ytF1'), t('home.ytF2'), t('home.ytF3')]}
          />
          <ToolCard
            href="/zoom-utilities"
            // Official Zoom wordmark; it already reads "zoom", so no extra label
            logo={<ZoomLogo height={16} />}
            description={t('home.zoomDesc')}
            features={[t('home.zoomF1'), t('home.zoomF2'), t('home.zoomF3')]}
          />
          <ToolCard
            href="/word-cloud"
            // The wordmark already reads "Wordcloud", so no extra label
            logo={<WordCloudLogo height={18} />}
            description={t('home.wcDesc')}
            features={[t('home.wcF1'), t('home.wcF2'), t('home.wcF3')]}
          />
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
