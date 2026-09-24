'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import { broadsheetTheme } from '@/lib/theme';

// message.*, notification.* and Modal.confirm render outside the React tree;
// holderRender gives them the same Broadsheet theme
ConfigProvider.config({
  holderRender: (children) => <ConfigProvider theme={broadsheetTheme}>{children}</ConfigProvider>,
});

export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={broadsheetTheme}>{children}</ConfigProvider>;
}
