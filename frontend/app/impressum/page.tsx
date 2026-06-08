'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ImpressumPage() {
  const { t } = useTranslation();

  const companyName =
    process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || t('legal.companyPlaceholder');
  const address =
    process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || t('legal.addressPlaceholder');
  const contactEmail =
    process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || 'privacy@example.com';
  const registerCourt =
    process.env.NEXT_PUBLIC_LEGAL_REGISTER_COURT?.trim() || t('legal.registerCourtPlaceholder');
  const registerNumber =
    process.env.NEXT_PUBLIC_LEGAL_REGISTER_NUMBER?.trim() || t('legal.registerNumberPlaceholder');
  const vatId = process.env.NEXT_PUBLIC_LEGAL_VAT_ID?.trim() || t('legal.vatPlaceholder');

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
          <h1 className="text-2xl font-bold text-slate-900">{t('legal.impressum.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('legal.impressum.subtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.impressum.provider')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p className="font-medium">{companyName}</p>
            <p>{address}</p>
            <p>
              {t('legal.email')}:{' '}
              <a href={`mailto:${contactEmail}`} className="text-blue-700 hover:underline">
                {contactEmail}
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.impressum.register')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{registerCourt}</p>
            <p>{registerNumber}</p>
            <p>{vatId}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.impressum.liability')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">
            <p>{t('legal.impressum.liabilityText')}</p>
          </CardContent>
        </Card>

        <p className="text-sm text-slate-500">
          <Link href="/datenschutz" className="text-blue-700 hover:underline">
            {t('legal.links.privacy')}
          </Link>
          {' · '}
          <Link href="/agb" className="text-blue-700 hover:underline">
            {t('legal.links.terms')}
          </Link>
        </p>
      </main>
    </div>
  );
}
