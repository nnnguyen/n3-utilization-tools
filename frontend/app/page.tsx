'use client';

import React, { useEffect } from 'react';
import { Card, Row, Col, Typography, Button, Space, Tag } from 'antd';
import { YoutubeOutlined, VideoCameraOutlined, CloudOutlined, ArrowRightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

const { Title, Paragraph, Text } = Typography;

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return null;
  }
  return (
    <div style={{ padding: '50px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '50px' }}>
        <Title>N3 Utilization Tools</Title>
        <Paragraph style={{ fontSize: '18px' }}>
          A powerful collection of tools to enhance your productivity with YouTube, Zoom, and more.
        </Paragraph>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <Card 
            hoverable 
            title={<Space><YoutubeOutlined style={{ color: '#ff0000' }} /> YouTube Utilities</Space>}
            actions={[
              <Link href="/youtube-utilities" key="go">
                <Button type="primary" danger icon={<ArrowRightOutlined />}>Explore</Button>
              </Link>
            ]}
          >
            <Paragraph>
              Manage your YouTube channel, upload videos manually, and track your upload history.
            </Paragraph>
            <ul>
              <li>OAuth2 Connection</li>
              <li>Manual Uploader</li>
              <li>Library Manager</li>
            </ul>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card 
            hoverable 
            title={<Space><VideoCameraOutlined style={{ color: '#2D8CFF' }} /> Zoom Utilities</Space>}
            actions={[
              <Link href="/zoom-utilities" key="go">
                <Button type="primary" icon={<ArrowRightOutlined />}>Explore</Button>
              </Link>
            ]}
          >
            <Paragraph>
              Automate your Zoom workflow by automatically uploading recordings to YouTube.
            </Paragraph>
            <ul>
              <li>Webhook Integration</li>
              <li>Auto-upload Rules</li>
              <li>Sync History Logs</li>
            </ul>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card
            hoverable
            title={<Space><CloudOutlined style={{ color: '#1890ff' }} /> Word Cloud</Space>}
            actions={[
              <Link href="/word-cloud" key="go">
                <Button icon={<ArrowRightOutlined />}>Explore</Button>
              </Link>
            ]}
          >
            <Paragraph>
              Real-time audience engagement with live word clouds.
            </Paragraph>
            <ul>
              <li>Real-time Voting</li>
              <li>Dynamic Word Clouds</li>
              <li>Presentation Mode</li>
            </ul>
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: '80px', textAlign: 'center', padding: '40px', background: '#f0f2f5', borderRadius: '12px' }}>
        <Title level={3}>Getting Started</Title>
        <Paragraph>
          Configure your API keys and Webhook tokens in the dashboard to unlock full automation.
        </Paragraph>
        <Space size="large">
          <Text strong>YouTube API: <Tag color="success">Ready</Tag></Text>
          <Text strong>Zoom Webhook: <Tag color="processing">Setup Required</Tag></Text>
          <Text strong>Word Cloud: <Tag color="success">Ready</Tag></Text>
        </Space>
      </div>
    </div>
  );
}
