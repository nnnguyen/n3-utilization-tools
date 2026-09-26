'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Card, Space, Typography, message } from 'antd';
import { useAuth } from '@/lib/auth-context';
import { usePreferences } from '@/lib/preferences';
import { useT } from '@/lib/i18n';
import { isUntrackedPath } from '@/lib/product-analytics';

const { Text } = Typography;

// Asked once after sign-in (P2-8): nothing is tracked until the account says
// yes; the answer can be changed in Settings → Personalization. Only asked
// when PostHog is configured for this deployment.
export default function AnalyticsConsentPrompt() {
  const t = useT();
  const pathname = usePathname();
  const { user } = useAuth();
  const { updatePreferences } = usePreferences();
  const [saving, setSaving] = useState<boolean | null>(null);

  if (
    !process.env.NEXT_PUBLIC_POSTHOG_KEY ||
    !user ||
    user.mustChangePassword ||
    (user.preferences?.analyticsConsent ?? null) !== null ||
    isUntrackedPath(pathname) ||
    pathname === '/login'
  ) {
    return null;
  }

  const answer = async (analyticsConsent: boolean) => {
    setSaving(analyticsConsent);
    try {
      await updatePreferences({ analyticsConsent });
    } catch (error: any) {
      message.error(t('personalization.saveFailed', { error: error.message || '' }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="analytics-consent-title"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 1000, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
    >
      <Card size="small" style={{ maxWidth: 560, width: '100%', pointerEvents: 'auto', boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)' }}>
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Text strong id="analytics-consent-title">{t('analyticsConsent.title')}</Text>
          <Text type="secondary">{t('analyticsConsent.body')}</Text>
          <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => answer(false)} loading={saving === false} disabled={saving === true}>
              {t('analyticsConsent.decline')}
            </Button>
            <Button type="primary" onClick={() => answer(true)} loading={saving === true} disabled={saving === false}>
              {t('analyticsConsent.accept')}
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
