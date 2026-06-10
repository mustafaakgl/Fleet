'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { departureChecksApi, getApiErrorMessage } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import type { DepartureCheck, MissingDepartureCheck } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function overallClass(status: string) {
  return status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800';
}

export default function DepartureChecksPage() {
  const { t } = useTranslation();
  const [checks, setChecks] = useState<DepartureCheck[]>([]);
  const [missing, setMissing] = useState<MissingDepartureCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, missingRows] = await Promise.all([
        departureChecksApi.list(),
        departureChecksApi.missingToday(),
      ]);
      setChecks(rows);
      setMissing(missingRows);
    } catch (e) {
      setChecks([]);
      setMissing([]);
      setError(getApiErrorMessage(e, t('departureChecks.loadError', 'Abfahrtskontrollen konnten nicht geladen werden.')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-8 w-8 text-blue-700" />
          <h1 className={FLEET_PAGE_TITLE}>{t('departureChecks.title', 'Abfahrtskontrolle')}</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href="/defects">{t('nav.defects', 'Mängel')}</Link>
        </Button>
      </div>

      {!loading && error ? (
        <EmptyState
          icon={WifiOff}
          title={t('departureChecks.loadErrorTitle', 'Daten konnten nicht geladen werden')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => {
            void load();
          }}
        />
      ) : null}

      {!loading && !error && missing.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-900">
              {t('departureChecks.missingToday', 'Heute fehlend')} ({missing.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {missing.map((row) => (
              <div key={`${row.driver_id}-${row.vehicle_id}`} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {row.driver_name} — {row.vehicle_plate}
                </span>
                <span className="text-amber-800">
                  {row.start_time} · {formatDate(row.work_date)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('departureChecks.loading', 'Laden…')}</div>
        ) : !error && checks.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={t('departureChecks.emptyTitle', 'Keine Kontrollen')}
            subtitle={t('departureChecks.emptyMessage', 'Noch keine Abfahrtskontrollen erfasst.')}
          />
        ) : !error ? (
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('departureChecks.colDate', 'Datum')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('departureChecks.colDriver', 'Fahrer')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('departureChecks.colVehicle', 'Fahrzeug')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('departureChecks.colStatus', 'Ergebnis')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {checks.map((check) => (
                <TableRow key={check.id} className={FLEET_TABLE_ROW_CLICKABLE}>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/departure-checks/${check.id}`} className="block">
                      {formatDate(check.performed_at)}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                    <Link href={`/departure-checks/${check.id}`} className="block">
                      {check.driver.name}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/departure-checks/${check.id}`} className="block">
                      {check.vehicle.plate_number}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/departure-checks/${check.id}`} className="block">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${overallClass(check.overall_status)}`}>
                        {t(`departureChecks.overall.${check.overall_status}`, check.overall_status)}
                      </span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}
