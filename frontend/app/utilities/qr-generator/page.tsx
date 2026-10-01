'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Typography, 
  Card, 
  Tabs, 
  Form, 
  Input, 
  Select, 
  Button, 
  Space, 
  Layout,
  Alert, 
  Row, 
  Col, 
  Table,
  Modal,
  message,
  Popconfirm,
  theme,
  Tooltip, 
  Grid,
} from 'antd';
import { 
  DownloadOutlined, 
  QrcodeOutlined, 
  WifiOutlined, 
  LinkOutlined, 
  FileTextOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { useT } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Content } = Layout;

type QRType = 'url' | 'text' | 'wifi';

interface DynamicQR {
  id: string;
  name: string | null;
  shortCode: string;
  targetUrl: string;
  scanCount: number;
  createdAt: string;
}

export default function QRGeneratorPage() {
  const t = useT();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [activeTab, setActiveTab] = useState('static');
  
  // Static QR States
  const [qrType, setQrType] = useState<QRType>('url');
  const [content, setContent] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [encryption, setEncryption] = useState('WPA');

  // Dynamic QR States
  const [dynamicQRs, setDynamicQRs] = useState<DynamicQR[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQR, setEditingQR] = useState<DynamicQR | null>(null);
  const [form] = Form.useForm();

  const getQRValue = () => {
    if (qrType === 'url' || qrType === 'text') return content;
    if (qrType === 'wifi') {
      const enc = encryption === 'none' ? '' : encryption;
      return `WIFI:S:${ssid};T:${enc};P:${password};;`;
    }
    return '';
  };

  const staticQRValue = getQRValue();

  useEffect(() => {
    if (activeTab === 'dynamic') {
      fetchDynamicQRs();
    }
  }, [activeTab]);

  const fetchDynamicQRs = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/qr') as DynamicQR[];
      setDynamicQRs(data);
    } catch (err) {
      message.error('Failed to fetch dynamic QR codes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDynamic = async (values: any) => {
    try {
      if (editingQR) {
        await apiFetch(`/qr/${editingQR.id}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        });
        message.success('QR Code updated');
      } else {
        await apiFetch('/qr', {
          method: 'POST',
          body: JSON.stringify(values),
        });
        message.success('Dynamic QR Code created');
      }
      setModalOpen(false);
      form.resetFields();
      fetchDynamicQRs();
    } catch (err) {
      message.error('Failed to save QR Code');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/qr/${id}`, { method: 'DELETE' });
      message.success('QR Code deleted');
      fetchDynamicQRs();
    } catch (err) {
      message.error('Failed to delete QR Code');
    }
  };

  const downloadPNG = (canvasId: string, filename: string) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = url;
    link.click();
  };

  const downloadSVG = (svgId: string, filename: string) => {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.download = `${filename}.svg`;
    link.href = url;
    link.click();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const dynamicColumns = [
    {
      title: t('qr.dynamic.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: DynamicQR) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{text || 'Untitled'}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>{record.shortCode}</Text>
        </Space>
      ),
    },
    {
      title: t('qr.dynamic.targetUrl'),
      dataIndex: 'targetUrl',
      key: 'targetUrl',
      ellipsis: true,
      render: (url: string) => (
        <Tooltip title={url}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <LinkOutlined /> {url}
          </a>
        </Tooltip>
      ),
    },
    {
      title: t('qr.dynamic.scans'),
      dataIndex: 'scanCount',
      key: 'scanCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => <Badge count={count} showZero color={token.colorPrimary} />,
    },
    {
      title: t('qr.dynamic.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('qr.dynamic.actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: DynamicQR) => {
        const shortUrl = `${window.location.origin}/q/${record.shortCode}`;
        return (
          <Space>
            <Tooltip title={t('qr.copyLink')}>
              <Button icon={<CopyOutlined />} size="small" onClick={() => copyToClipboard(shortUrl)} />
            </Tooltip>
            <Tooltip title={t('qr.dynamic.edit')}>
              <Button 
                icon={<EditOutlined />} 
                size="small" 
                onClick={() => {
                  setEditingQR(record);
                  form.setFieldsValue(record);
                  setModalOpen(true);
                }} 
              />
            </Tooltip>
            <Tooltip title={t('qr.download')}>
              <Button 
                icon={<DownloadOutlined />} 
                size="small" 
                onClick={() => {
                  // Small hack to download dynamic QR
                  const canvas = document.createElement('canvas');
                  // We would need to render a QR for this URL to download it
                  // For now, just a placeholder or message
                  message.info('Open preview to download');
                }} 
              />
            </Tooltip>
            <Popconfirm title="Delete this QR Code?" onConfirm={() => handleDelete(record.id)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <DashboardLayout>
        <Content
          style={{
            padding: 0,
            minHeight: 280,
            background: 'transparent',
            borderRadius: token.borderRadiusLG,
          }}
        >
          <div style={{ padding: screens.sm ? '24px' : '12px' }}>
            <Row gutter={[24, 24]}>
              <Col span={24}>
                <Title level={2}>
                  <QrcodeOutlined style={{ marginRight: 8 }} />
                  {t('qr.title')}
                </Title>
                <Paragraph type="secondary">
                  {t('qr.description')}
                </Paragraph>
              </Col>

              <Col span={24}>
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  items={[
                    {
                      key: 'static',
                      label: t('qr.staticTab'),
                      children: (
                        <Card>
                          <Row gutter={48}>
                            <Col xs={24} md={14}>
                              <Form layout="vertical">
                                <Form.Item label={t('qr.type')}>
                                  <Select 
                                    value={qrType} 
                                    onChange={(val: QRType) => setQrType(val)}
                                    options={[
                                      { value: 'url', label: <span><LinkOutlined /> URL</span> },
                                      { value: 'text', label: <span><FileTextOutlined /> {t('qr.type.text')}</span> },
                                      { value: 'wifi', label: <span><WifiOutlined /> WiFi</span> },
                                    ]}
                                  />
                                </Form.Item>
                                {qrType !== 'wifi' ? (
                                  <Form.Item label={t('qr.content')}>
                                    <Input.TextArea 
                                      rows={4} 
                                      value={content} 
                                      onChange={(e) => setContent(e.target.value)}
                                      placeholder={t('qr.contentPlaceholder')}
                                    />
                                  </Form.Item>
                                ) : (
                                  <>
                                    <Form.Item label={t('qr.wifi.ssid')}>
                                      <Input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="My WiFi Network" />
                                    </Form.Item>
                                    <Form.Item label={t('qr.wifi.password')}>
                                      <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                                    </Form.Item>
                                    <Form.Item label={t('qr.wifi.encryption')}>
                                      <Select 
                                        value={encryption} 
                                        onChange={setEncryption}
                                        options={[
                                          { value: 'WPA', label: 'WPA/WPA2' },
                                          { value: 'WEP', label: 'WEP' },
                                          { value: 'none', label: t('qr.wifi.encryption.none') },
                                        ]}
                                      />
                                    </Form.Item>
                                  </>
                                )}
                              </Form>
                            </Col>
                            <Col xs={24} md={10}>
                              <div style={{ 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                minHeight: '300px', background: token.colorFillAlter, borderRadius: token.borderRadiusLG, padding: '24px'
                              }}>
                                <Text strong style={{ marginBottom: 16 }}>{t('qr.preview')}</Text>
                                <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', marginBottom: 24 }}>
                                  {staticQRValue ? (
                                    <>
                                      <QRCodeSVG id="qr-static-svg" value={staticQRValue} size={200} level="H" includeMargin={true} />
                                      <div style={{ display: 'none' }}>
                                        <QRCodeCanvas id="qr-static-canvas" value={staticQRValue} size={512} level="H" includeMargin={true} />
                                      </div>
                                    </>
                                  ) : (
                                    <div style={{ 
                                      width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      border: `1px dashed ${token.colorBorder}`, color: token.colorTextDisabled
                                    }}>
                                      {t('qr.contentPlaceholder')}
                                    </div>
                                  )}
                                </div>
                                <Space>
                                  <Button icon={<DownloadOutlined />} onClick={() => downloadPNG('qr-static-canvas', 'qr-static')} disabled={!staticQRValue}>
                                    {t('qr.downloadPng')}
                                  </Button>
                                  <Button icon={<DownloadOutlined />} onClick={() => downloadSVG('qr-static-svg', 'qr-static')} disabled={!staticQRValue}>
                                    {t('qr.downloadSvg')}
                                  </Button>
                                </Space>
                              </div>
                            </Col>
                          </Row>
                        </Card>
                      )
                    },
                    {
                      key: 'dynamic',
                      label: t('qr.dynamicTab'),
                      children: (
                        <Card>
                          <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
                            <Col>
                              <Paragraph type="secondary" style={{ margin: 0 }}>{t('qr.dynamicDesc')}</Paragraph>
                            </Col>
                            <Col>
                              <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                                setEditingQR(null);
                                form.resetFields();
                                setModalOpen(true);
                              }}>
                                {t('qr.dynamic.create')}
                              </Button>
                            </Col>
                          </Row>
                          
                          <Table 
                            dataSource={dynamicQRs} 
                            columns={dynamicColumns} 
                            rowKey="id" 
                            loading={loading}
                            locale={{ emptyText: t('qr.dynamic.noData') }}
                          />
                        </Card>
                      )
                    }
                  ]}
                />
              </Col>
            </Row>

            <Modal
              title={editingQR ? t('qr.dynamic.edit') : t('qr.dynamic.create')}
              open={modalOpen}
              onCancel={() => setModalOpen(false)}
              onOk={() => form.submit()}
              destroyOnHidden
            >
              <Form form={form} layout="vertical" onFinish={handleSaveDynamic} style={{ marginTop: 16 }}>
                <Form.Item name="name" label={t('qr.dynamic.name')}>
                  <Input placeholder="Marketing Campaign A" />
                </Form.Item>
                <Form.Item 
                  name="targetUrl" 
                  label={t('qr.dynamic.targetUrl')} 
                  rules={[{ required: true, message: 'Please input target URL' }, { type: 'url', message: 'Must be a valid URL' }]}
                >
                  <Input placeholder="https://example.com/promo" />
                </Form.Item>
              </Form>
            </Modal>
          </div>
        </Content>
    </DashboardLayout>
  );
}

// Additional component needed for Badge
const Badge = ({ count, showZero, color }: { count: number, showZero?: boolean, color?: string }) => {
  if (count === 0 && !showZero) return null;
  return (
    <span style={{ 
      background: color || '#1890ff', 
      color: '#fff', 
      padding: '2px 8px', 
      borderRadius: '10px',
      fontSize: '12px'
    }}>
      {count}
    </span>
  );
};
