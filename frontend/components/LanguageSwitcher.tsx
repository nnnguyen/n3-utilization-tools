'use client';

import React from 'react';
import { Segmented, message } from 'antd';
import { usePreferences, type Language } from '@/lib/preferences';
import { useT } from '@/lib/i18n';

// Quick VI / EN switch (header, login page). Signed in, the choice is saved to
// the account like the Personalization page; signed out it stays in this browser.
export default function LanguageSwitcher() {
  const t = useT();
  const { language, updatePreferences } = usePreferences();

  const change = async (value: Language) => {
    try {
      await updatePreferences({ language: value });
    } catch (error: any) {
      message.error(t('personalization.saveFailed', { error: error.message || '' }));
    }
  };

  return (
    <Segmented
      size="small"
      aria-label={t('personalization.language.title')}
      value={language}
      onChange={(value) => change(value as Language)}
      options={[
        { label: 'VI', value: 'vi', title: 'Tiếng Việt' },
        { label: 'EN', value: 'en', title: 'English' },
      ]}
    />
  );
}
