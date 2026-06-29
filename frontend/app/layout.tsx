import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { GlobalToaster } from '@/components/ui/global-toaster';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { LANG_STORAGE_KEY, resolveLanguage } from '@/src/language';

export const metadata: Metadata = {
  title: 'MyFleet — Fleet Management Platform',
  description:
    'Track vehicles, manage drivers, plan routes and stay compliant — all from one cloud platform.',
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
