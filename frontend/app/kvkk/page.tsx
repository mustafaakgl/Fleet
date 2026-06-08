'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function KvkkPage() {
  const { t } = useTranslation();

  const controllerName =
    process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || t('legal.companyPlaceholder');
  const contactEmail =
    process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || 'privacy@example.com';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <MyFleetLogo height={40} href="/" />
          <Link href="/login" className="text-sm font-medium text-blue-700 hover:underline">
            {t('auth.signIn')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('legal.kvkk.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('legal.kvkk.subtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.kvkk.controller')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{t('legal.kvkk.controllerText', { name: controllerName })}</p>
            <p>
              {t('legal.email')}:{' '}
              <a href={`mailto:${contactEmail}`} className="text-blue-700 hover:underline">
                {contactEmail}
              </a>
            </p>
          </CardContent>
        </Card>

        {(['purpose', 'legalBasis', 'rights', 'retention'] as const).map((section) => (
          <Card key={section}>
            <CardHeader>
              <CardTitle>{t(`legal.kvkk.section.${section}.title`)}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <p>{t(`legal.kvkk.section.${section}.text`)}</p>
            </CardContent>
          </Card>
        ))}

        <p className="text-sm text-slate-500">
          <Link href="/datenschutz" className="text-blue-700 hover:underline">
            {t('legal.links.privacy')}
          </Link>
          {' · '}
          <Link href="/impressum" className="text-blue-700 hover:underline">
            {t('legal.links.imprint')}
          </Link>
        </p>
      </main>
    </div>
  );
}
