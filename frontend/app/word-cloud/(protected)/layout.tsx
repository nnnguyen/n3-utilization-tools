import DashboardLayout from '@/components/DashboardLayout';

// Authenticated word-cloud routes (dashboard, topics/*) get the shared
// dashboard chrome and its login gate. Public routes (join/[code],
// reset-password, verify-email) live outside this group so they render
// without an account — see app/word-cloud/layout.tsx.
export default function WordCloudProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
