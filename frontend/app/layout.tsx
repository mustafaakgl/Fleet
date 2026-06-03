import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/components/providers/I18nProvider';

export const metadata: Metadata = {
  title: 'MyFleet — Fleet Management Platform',
  description:
    'Track vehicles, manage drivers, plan routes and stay compliant — all from one cloud platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
