import type { Metadata } from 'next';
import localFont from 'next/font/local';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'SOH Word Cloud',
  description: 'SOH Word Cloud - Presentation Tool',
};

import DashboardLayout from '@/components/DashboardLayout';

// Nested layout, not a root layout: the app's real <html>/<body> come from
// app/layout.tsx. This just scopes the Geist font variables to this subtree.
export default function WordCloudLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`}>
      <DashboardLayout>{children}</DashboardLayout>
    </div>
  );
}
