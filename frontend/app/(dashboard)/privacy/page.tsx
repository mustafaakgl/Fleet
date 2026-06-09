'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { auditApi, type AuditLogRow } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  FLEET_LIST_CARD,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { cn, formatDate } from '@/lib/utils';

const LEGAL_DOCS = [
  { href: '/legal/AVV-Vorlage-DE.md', labelKey: 'privacy.docs.avv' },
  { href: '/legal/AVV-Anlage-TOMs.md', labelKey: 'privacy.docs.toms' },
  { href: '/legal/TOMs-Zusammenfassung-Vertrieb.md', labelKey: 'privacy.docs.tomsSummary' },
  { href: '/legal/Unterauftragsverarbeiter.md', labelKey: 'privacy.docs.subprocessors' },
  { href: '/legal/Datenaufbewahrung.md', labelKey: 'privacy.docs.retention' },
];

export default function PrivacyPage() {
  const { t } = useTranslation();
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  const controllerName =
    process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() || t('privacy.controllerPlaceholder');
  const contactEmail =
    process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || 'privacy@example.com';

  useEffect(() => {
    const user = getUser();
    if (user?.role !== 'admin') return;

    auditApi
      .list()
      .then(setAuditLogs)
      .catch(() => setAuditError(t('privacy.auditLoadError')));
  }, [t]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
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
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>{t('privacy.retention.intro')}</p>
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('privacy.retention.colCategory')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('privacy.retention.colPeriod')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              <TableRow className={FLEET_TABLE_ROW}>
                <TableCell className={FLEET_TABLE_CELL}>{t('privacy.retention.location')}</TableCell>
                <TableCell className={FLEET_TABLE_CELL_MUTED}>90 {t('privacy.retention.days')}</TableCell>
              </TableRow>
              <TableRow className={FLEET_TABLE_ROW}>
                <TableCell className={FLEET_TABLE_CELL}>{t('privacy.retention.audit')}</TableCell>
                <TableCell className={FLEET_TABLE_CELL_MUTED}>2 {t('privacy.retention.years')}</TableCell>
              </TableRow>
              <TableRow className={FLEET_TABLE_ROW}>
                <TableCell className={FLEET_TABLE_CELL}>{t('privacy.retention.documents')}</TableCell>
                <TableCell className={FLEET_TABLE_CELL_MUTED}>{t('privacy.retention.documentsPeriod')}</TableCell>
              </TableRow>
              <TableRow className={FLEET_TABLE_ROW}>
                <TableCell className={FLEET_TABLE_CELL}>{t('privacy.retention.assignments')}</TableCell>
                <TableCell className={FLEET_TABLE_CELL_MUTED}>10 {t('privacy.retention.years')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('privacy.section.rights')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>{t('privacy.rights.text')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('privacy.rights.access')}</li>
            <li>{t('privacy.rights.rectification')}</li>
            <li>{t('privacy.rights.erasure')}</li>
            <li>{t('privacy.rights.objection')}</li>
          </ul>
          <p className="pt-2 text-slate-600">{t('privacy.rights.adminHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('privacy.section.processors')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>{t('privacy.processors.hosting')}</li>
            <li>{t('privacy.processors.deepl')}</li>
            <li>{t('privacy.processors.push')}</li>
          </ul>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t('privacy.section.audit')}</CardTitle>
          <Link href="/audit" className="text-sm font-medium text-blue-700 hover:underline">
            {t('privacy.openAuditLog')}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {auditError ? (
            <p className="px-6 py-4 text-sm text-rose-600">{auditError}</p>
          ) : auditLogs.length === 0 ? (
            <p className="px-6 py-4 text-sm text-slate-500">{t('privacy.auditEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('privacy.audit.when')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('privacy.audit.actor')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('privacy.audit.action')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('privacy.audit.entity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {auditLogs.slice(0, 50).map((row) => (
                    <TableRow key={row.id} className={FLEET_TABLE_ROW}>
                      <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'whitespace-nowrap')}>
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.actorUser?.fullName ?? '—'}
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL, 'font-mono')}>{row.action}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>
                        {row.entityType}
                        {row.entityId ? ` / ${row.entityId.slice(0, 8)}…` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-500">
        <Link href="/drivers" className="text-blue-700 hover:underline">
          {t('privacy.backToDrivers')}
        </Link>
      </p>
    </div>
  );
}
