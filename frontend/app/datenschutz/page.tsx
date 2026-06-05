'use client';

import Link from 'next/link';
import { Download, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LEGAL_DOCS = [
  { href: '/legal/AVV-Vorlage-DE.md', labelKey: 'privacy.docs.avv' },
  { href: '/legal/AVV-Anlage-TOMs.md', labelKey: 'privacy.docs.toms' },
  { href: '/legal/TOMs-Zusammenfassung-Vertrieb.md', labelKey: 'privacy.docs.tomsSummary' },
  { href: '/legal/Unterauftragsverarbeiter.md', labelKey: 'privacy.docs.subprocessors' },
  { href: '/legal/Datenaufbewahrung.md', labelKey: 'privacy.docs.retention' },
];

export default function PublicPrivacyPage() {
  const { t } = useTranslation();

  const controllerName =
    process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || t('privacy.controllerPlaceholder');
  const contactEmail =
    process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || 'privacy@example.com';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <MyFleetLogo height={40} href="/" />
          <Link href="/login" className="text-sm font-medium text-blue-700 hover:underline">
            {t('auth.signIn')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-3">
            <Shield className="h-6 w-6 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('privacy.title')}</h1>
            <p className="mt-1 text-sm text-slate-600">{t('privacy.subtitle')}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('privacy.section.controller')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{t('privacy.controllerText', { name: controllerName })}</p>
            <p>
              {t('privacy.contact')}:{' '}
              <a href={`mailto:${contactEmail}`} className="font-medium text-blue-700 hover:underline">
                {contactEmail}
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('privacy.section.data')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>{t('privacy.data.drivers')}</li>
              <li>{t('privacy.data.vehicles')}</li>
              <li>{t('privacy.data.documents')}</li>
              <li>{t('privacy.data.location')}</li>
              <li>{t('privacy.data.assignments')}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('privacy.section.legalBasis')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>{t('privacy.legal.contract')}</li>
              <li>{t('privacy.legal.legitimate')}</li>
              <li>{t('privacy.legal.consent')}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('privacy.section.retention')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('privacy.retention.colCategory')}</TableHead>
                  <TableHead>{t('privacy.retention.colPeriod')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{t('privacy.retention.location')}</TableCell>
                  <TableCell>90 {t('privacy.retention.days')}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('privacy.retention.audit')}</TableCell>
                  <TableCell>2 {t('privacy.retention.years')}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('privacy.retention.documents')}</TableCell>
                  <TableCell>{t('privacy.retention.documentsPeriod')}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('privacy.retention.assignments')}</TableCell>
                  <TableCell>10 {t('privacy.retention.years')}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('privacy.section.docs')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {LEGAL_DOCS.map((doc) => (
              <a
                key={doc.href}
                href={doc.href}
                download
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                {t(doc.labelKey)}
              </a>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
