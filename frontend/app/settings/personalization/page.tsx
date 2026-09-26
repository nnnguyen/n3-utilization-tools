'use client';

import React from 'react';
import { Card, Radio, Segmented, Space, Switch, Typography, message } from 'antd';
import { SunOutlined, MoonOutlined, DesktopOutlined } from '@ant-design/icons';
import DashboardLayout from '../../../components/DashboardLayout';
import { usePreferences, type Preferences } from '@/lib/preferences';
import { useT, translate } from '@/lib/i18n';

const { Title, Text, Paragraph } = Typography;

// Each option is labelled in its own language so it can be found whatever the current one is
const LANGUAGE_OPTIONS = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

export default function PersonalizationPage() {
  const t = useT();
  const { themeStyle, themeMode, language, analyticsConsent, resolvedMode, updatePreferences } = usePreferences();

  // Saved as soon as it changes; reverted (with an error) if the account rejects it
  const save = async (changes: Partial<Preferences>) => {
    try {
      await updatePreferences(changes);
      // In the newly chosen language when that is what changed
      message.success(translate(changes.language ?? language, 'personalization.saved'));
    } catch (error: any) {
      message.error(t('personalization.saveFailed', { error: error.message || '' }));
    }
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 760 }}>
        <Title level={2} style={{ marginBottom: 4 }}>{t('personalization.title')}</Title>
        <Paragraph type="secondary">{t('personalization.subtitle')}</Paragraph>

        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Card title={t('personalization.style.title')}>
            <Radio.Group
              value={themeStyle}
              onChange={(e) => save({ themeStyle: e.target.value })}
              style={{ width: '100%' }}
            >
              <Space orientation="vertical" size="middle">
                <Radio value="broadsheet">
                  <Text strong>{t('personalization.style.broadsheet')}</Text>
                  <br />
                  <Text type="secondary">{t('personalization.style.broadsheetDesc')}</Text>
                </Radio>
                <Radio value="organic">
                  <Text strong>{t('personalization.style.organic')}</Text>
                  <br />
                  <Text type="secondary">{t('personalization.style.organicDesc')}</Text>
                </Radio>
                <Radio value="classic">
                  <Text strong>{t('personalization.style.classic')}</Text>
                  <br />
                  <Text type="secondary">{t('personalization.style.classicDesc')}</Text>
                </Radio>
              </Space>
            </Radio.Group>
          </Card>

          <Card title={t('personalization.mode.title')}>
            <Segmented
              value={themeMode}
              onChange={(value) => save({ themeMode: value as Preferences['themeMode'] })}
              options={[
                { value: 'light', label: t('personalization.mode.light'), icon: <SunOutlined /> },
                { value: 'dark', label: t('personalization.mode.dark'), icon: <MoonOutlined /> },
                { value: 'system', label: t('personalization.mode.system'), icon: <DesktopOutlined /> },
              ]}
            />
            {themeMode === 'system' && (
              <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                {t('personalization.mode.systemHint', {
                  mode: t(resolvedMode === 'dark' ? 'personalization.mode.dark' : 'personalization.mode.light'),
                })}
              </Paragraph>
            )}
          </Card>

          <Card title={t('personalization.language.title')}>
            <Radio.Group
              value={language}
              onChange={(e) => save({ language: e.target.value })}
              options={LANGUAGE_OPTIONS}
              optionType="button"
            />
          </Card>

          <Card title={t('personalization.analytics.title')}>
            <Space align="start" size="middle">
              <Switch
                id="analytics-consent"
                checked={analyticsConsent === true}
                onChange={(checked) => save({ analyticsConsent: checked })}
              />
              <div>
                <label htmlFor="analytics-consent"><Text strong>{t('personalization.analytics.label')}</Text></label>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>{t('personalization.analytics.desc')}</Paragraph>
              </div>
            </Space>
          </Card>
        </Space>
      </div>
    </DashboardLayout>
  );
}
