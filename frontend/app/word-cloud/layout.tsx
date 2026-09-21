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

// Nested layout, not a root layout: the app's real <html>/<body> come from
// app/layout.tsx. This just scopes the Geist font variables to this subtree.
// It intentionally does NOT wrap children in DashboardLayout (which gates on
// login) — some routes under here (join/[code], reset-password, verify-email)
// are public, reached by audience members and emailed token links with no
// account. See app/word-cloud/(protected)/layout.tsx for the authenticated
// routes (dashboard, topics/*).
export default function WordCloudLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={`${geistSans.variable} ${geistMono.variable}`}>{children}</div>;
}
