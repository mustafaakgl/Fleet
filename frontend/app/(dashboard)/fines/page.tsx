'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Scale, WifiOff, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FineStatusBadge } from '@/components/fines/FineStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { finesApi, getApiErrorMessage } from '@/lib/api';
import { downloadFinesCsv } from '@/lib/fines-csv';
import {
  FLEET_FILTER_SELECT,
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
import type { Fine, FineStats, FineStatus } from '@/lib/types';
import { formatFleetCurrency } from '@/lib/locale-format';
import { formatDate } from '@/lib/utils';

const STATUS_VALUES: FineStatus[] = [
  'neu',
  'fahrer_zugeordnet',
  'fahrer_benachrichtigt',
  'bezahlt',
  'widerspruch',
  'abgeschlossen',
];

export default function FinesPage() {
  const { t } = useTranslation();
  const [fines, setFines] = useState<Fine[]>([]);
  const [dueSoon, setDueSoon] = useState<Fine[]>([]);
  const [stats, setStats] = useState<FineStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = useCallback(
    (status: FineStatus) => t(`fines.status.${status}`, status),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, dueRows, statsRow] = await Promise.all([
        finesApi.list(statusFilter ? { status: statusFilter } : undefined),
        finesApi.dueSoon(7),
        finesApi.stats(),
      ]);
      setFines(rows);
      setDueSoon(dueRows);
      setStats(statsRow);
    } catch (e) {
      setFines([]);
      setDueSoon([]);
      setStats(null);
      setError(getApiErrorMessage(e, t('fines.loadError', 'Bußgelder konnten nicht geladen werden.')));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(() => {
    if (!stats?.by_status) return 0;
    return (
      (stats.by_status.neu ?? 0) +
      (stats.by_status.fahrer_zugeordnet ?? 0) +
      (stats.by_status.fahrer_benachrichtigt ?? 0)
    );
  }, [stats]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Scale className="h-8 w-8 text-blue-700" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fines.title', 'Bußgeldverwaltung')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={fines.length === 0}
            onClick={() => downloadFinesCsv(fines)}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv', 'CSV exportieren')}
          </Button>
          <Button asChild>
            <Link href="/fines/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('fines.create', 'Bußgeld erfassen')}
            </Link>
          </Button>
        </div>
      </div>

      {!loading && error ? (
        <EmptyState
          icon={WifiOff}
          title={t('fines.loadErrorTitle', 'Daten konnten nicht geladen werden')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => {
            void load();
          }}
        />
      ) : null}

      {!loading && !error && stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('fines.stats.open', 'Offen')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{openCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('fines.stats.dueSoon', 'Zahlung fällig (7 Tage)')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-amber-700">{dueSoon.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('fines.stats.pendingAck', 'Bestätigung ausstehend')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {stats.by_status.fahrer_benachrichtigt ?? 0}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('fines.stats.total', 'Gesamt')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {Object.values(stats.by_status).reduce((sum, n) => sum + (n ?? 0), 0)}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loading && !error && dueSoon.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-900">
              {t('fines.dueSoonTitle', 'Bald fällige Zahlungen')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dueSoon.slice(0, 5).map((fine) => (
              <div key={fine.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/fines/${fine.id}`} className="font-medium text-blue-700 hover:underline">
                  {fine.vehicle.plate_number} — {fine.violation_type}
                </Link>
                <span className="text-amber-800">
                  {t('fines.dueInDays', '{{days}} Tage', { days: fine.days_until_due ?? '?' })}
                  {fine.payment_due_date ? ` (${formatDate(fine.payment_due_date)})` : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={FLEET_FILTER_SELECT}
        >
          <option value="">{t('fines.allStatuses', 'Alle Status')}</option>
          {STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('fines.loading', 'Laden…')}</div>
        ) : !error && fines.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={t('fines.emptyTitle', 'Keine Bußgelder')}
            subtitle={t('fines.emptyMessage', 'Erfassen Sie das erste Bußgeld über «Bußgeld erfassen».')}
            actionLabel={t('fines.create', 'Bußgeld erfassen')}
            onAction={() => {
              window.location.href = '/fines/new';
            }}
          />
        ) : !error ? (
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colDate', 'Datum')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colVehicle', 'Fahrzeug')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colDriver', 'Fahrer')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colType', 'Verstoß')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colAmount', 'Betrag')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colStatus', 'Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {fines.map((fine) => (
                <TableRow key={fine.id} className={FLEET_TABLE_ROW_CLICKABLE}>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/fines/${fine.id}`} className="block">
                      {formatDate(fine.violation_at)}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                    <Link href={`/fines/${fine.id}`} className="block">
                      {fine.vehicle.plate_number}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/fines/${fine.id}`} className="block">
                      {fine.driver?.name ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/fines/${fine.id}`} className="block">
                      {fine.violation_type}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/fines/${fine.id}`} className="block">
                      {formatFleetCurrency(fine.amount ?? 0)}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/fines/${fine.id}`} className="block">
                      <FineStatusBadge status={fine.status} label={statusLabel(fine.status)} />
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
