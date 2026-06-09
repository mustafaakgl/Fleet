'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { driversApi, workSessionsApi, type WorkSessionRow } from '@/lib/api';
import { downloadBlob } from '@/lib/download-blob';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FLEET_LIST_CARD,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { MobileDataCard, MobileField, MobileFieldGrid } from '@/components/ui/MobileDataCard';
import { cn } from '@/lib/utils';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function durationMinutes(startedAt: string, endedAt?: string | null) {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = endedAt ? new Date(endedAt) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatDuration(minutes: number | null) {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
}

function sessionsToCsv(rows: WorkSessionRow[]) {
  const header = 'Driver,Employee Number,Started,Ended,Duration (minutes),End Reason,Status\n';
  const lines = rows.map((row) => {
    const name = row.driver
      ? `${row.driver.firstName} ${row.driver.lastName}`.trim()
      : row.driverId;
    const minutes = durationMinutes(row.startedAt, row.endedAt);
    return [
      `"${name.replace(/"/g, '""')}"`,
      `"${(row.driver?.employeeNumber ?? '').replace(/"/g, '""')}"`,
      row.startedAt,
      row.endedAt ?? '',
      minutes ?? '',
      row.endReason ?? '',
      row.status,
    ].join(',');
  });
  return header + lines.join('\n');
}

export default function WorkSessionsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<WorkSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverId, setDriverId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'all' | 'active' | 'ended'>('all');
  const [driverOptions, setDriverOptions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    void driversApi
      .list({ limit: 200 })
      .then((page) => {
        setDriverOptions(
          page.data.map((d) => ({
            id: d.id,
            label: `${d.first_name} ${d.last_name}`.trim(),
          })),
        );
      })
      .catch(() => {
        // optional filter
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await workSessionsApi.list({
        driver_id: driverId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status === 'all' ? undefined : status,
      });
      setRows(data);
    } catch {
      setError(t('workSessions.loadError'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, driverId, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    let totalMinutes = 0;
    let endedCount = 0;
    for (const row of rows) {
      if (row.status === 'ended' && row.endedAt) {
        const mins = durationMinutes(row.startedAt, row.endedAt);
        if (mins !== null) {
          totalMinutes += mins;
          endedCount += 1;
        }
      }
    }
    const avgMinutes = endedCount > 0 ? Math.round(totalMinutes / endedCount) : 0;
    return { totalMinutes, endedCount, avgMinutes, activeCount: rows.filter((r) => r.status === 'active').length };
  }, [rows]);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = sessionsToCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `work-sessions-${stamp}.csv`);
    } catch {
      setError(t('workSessions.exportError'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('workSessions.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('workSessions.subtitle')}</p>
        </div>
        <Button onClick={() => void handleExport()} disabled={exporting || rows.length === 0}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {t('workSessions.exportCsv')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t('workSessions.summary.sessions')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{rows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t('workSessions.summary.active')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.activeCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t('workSessions.summary.totalHours')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatDuration(summary.totalMinutes)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t('workSessions.summary.avgSession')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatDuration(summary.avgMinutes)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('workSessions.filter.driver')}</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">{t('workSessions.filter.allDrivers')}</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('workSessions.filter.from')}</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('workSessions.filter.to')}</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('workSessions.filter.status')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="all">{t('workSessions.filter.allStatuses')}</option>
              <option value="active">{t('workSessions.status.active')}</option>
              <option value="ended">{t('workSessions.status.ended')}</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => void load()}>
              {t('workSessions.refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card className={FLEET_LIST_CARD}>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <>
            <div className={FLEET_LIST_MOBILE}>
              {rows.map((row) => {
                const minutes = durationMinutes(row.startedAt, row.endedAt);
                const driverName = row.driver
                  ? `${row.driver.firstName} ${row.driver.lastName}`.trim()
                  : row.driverId;
                return (
                  <MobileDataCard
                    key={row.id}
                    title={driverName}
                    subtitle={formatDateTime(row.startedAt)}
                    badge={
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {t(`workSessions.status.${row.status}`)}
                      </span>
                    }
                  >
                    <MobileFieldGrid>
                      <MobileField label={t('workSessions.col.duration')} value={row.status === 'active' ? t('workSessions.status.active') : formatDuration(minutes)} />
                      <MobileField label={t('workSessions.col.ended')} value={formatDateTime(row.endedAt)} />
                    </MobileFieldGrid>
                  </MobileDataCard>
                );
              })}
            </div>
            <div className={FLEET_LIST_DESKTOP}>
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.started')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.ended')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.duration')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.endReason')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {rows.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={6} className={cn(FLEET_TABLE_CELL_MUTED, 'py-10 text-center')}>
                      {t('workSessions.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const minutes = durationMinutes(row.startedAt, row.endedAt);
                    const driverName = row.driver
                      ? `${row.driver.firstName} ${row.driver.lastName}`.trim()
                      : row.driverId;
                    return (
                      <TableRow key={row.id} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{driverName}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatDateTime(row.startedAt)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatDateTime(row.endedAt)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.status === 'active' ? t('workSessions.status.active') : formatDuration(minutes)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>
                          {row.endReason ? t(`workSessions.endReason.${row.endReason}`) : '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{t(`workSessions.status.${row.status}`)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
