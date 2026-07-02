import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { GlobalToaster } from '@/components/ui/global-toaster';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { LANG_STORAGE_KEY, resolveLanguage } from '@/src/language';

export const metadata: Metadata = {
  title: {
    default: 'Fleet — Fleet Management Platform',
    template: '%s · Fleet',
  },
  description:
    'Track vehicles, manage drivers, plan routes and stay compliant — all from one cloud platform.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/myfleet-logo.png',
    apple: '/myfleet-logo.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const language = resolveLanguage(cookieStore.get(LANG_STORAGE_KEY)?.value);

  return (
    <html lang={language} className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <QueryProvider>
          <I18nProvider initialLanguage={language}>
            {children}
            <GlobalToaster />
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
