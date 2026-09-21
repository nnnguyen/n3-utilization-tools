'use client';

import React from 'react';
import { Card, Row, Col, Typography, Button, Space } from 'antd';
import { YoutubeOutlined, VideoCameraOutlined, CloudOutlined, ArrowRightOutlined } from '@ant-design/icons';
import Link from 'next/link';

const { Title, Paragraph, Text } = Typography;

export default function Home() {
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
              The classic my-mentimeter tool for real-time audience engagement and word clouds.
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
        </Space>
      </div>
    </div>
  );
}

// Dummy Tag component since we didn't import it
function Tag({ children, color }: any) {
  const styles: any = {
    success: { color: '#52c41a', background: '#f6ffed', border: '1px solid #b7eb8f' },
    processing: { color: '#1890ff', background: '#e6f7ff', border: '1px solid #91d5ff' },
  };
  return (
    <span style={{ 
      padding: '0 7px', 
      fontSize: '12px', 
      borderRadius: '2px', 
      display: 'inline-block',
      ...styles[color] 
    }}>
      {children}
    </span>
  );
}
