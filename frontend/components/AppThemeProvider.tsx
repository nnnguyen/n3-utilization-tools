'use client';

import React, { useEffect } from 'react';
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import type { Locale } from 'antd/es/locale';
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { buildTheme } from '@/lib/theme';
import { usePreferences } from '@/lib/preferences';

const ANTD_LOCALES: Record<'vi' | 'en', Locale> = { vi: viVN, en: enUS };

// message.*, notification.* and Modal.confirm render outside the React tree.
// holderRender runs on every such render and reads these, so they follow the
// current preferences too.
let staticTheme: ThemeConfig = buildTheme('broadsheet', 'light');
let staticLocale: Locale = viVN;
ConfigProvider.config({
  holderRender: (children) => (
    <ConfigProvider theme={staticTheme} locale={staticLocale}>{children}</ConfigProvider>
  ),
});

export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { themeStyle, resolvedMode, language } = usePreferences();
  const theme = buildTheme(themeStyle, resolvedMode);
  const locale = ANTD_LOCALES[language];
  staticTheme = theme;
  staticLocale = locale;

  // Month/day names in date pickers and dayjs formatting
  useEffect(() => {
    dayjs.locale(language === 'vi' ? 'vi' : 'en');
  }, [language]);

  return (
    <ConfigProvider theme={theme} locale={locale}>
      {children}
    </ConfigProvider>
  );
}
