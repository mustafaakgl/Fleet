'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { driversApi, workSessionsApi, type WorkSessionRow } from '@/lib/api';
import { downloadBlob } from '@/lib/download-blob';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreakCandidatePanel } from '@/components/work-sessions/BreakCandidatePanel';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { ZeiterfassungMonth } from '@/components/work-time/ZeiterfassungMonth';
import { formatFleetDateTime, formatFleetDurationMinutes } from '@/lib/locale-format';
import { cn } from '@/lib/utils';

function durationMinutes(startedAt: string, endedAt?: string | null) {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = endedAt ? new Date(endedAt) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function toDatetimeLocal(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function sessionsToCsv(rows: WorkSessionRow[], header: string) {
  const lines = rows.map((row) => {
    const name = row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : row.driverId;
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
  const [status, setStatus] = useState<'all' | 'active' | 'ended' | 'stale_open'>('all');
  const [driverOptions, setDriverOptions] = useState<{ id: string; label: string }[]>([]);
  const [selectedRow, setSelectedRow] = useState<WorkSessionRow | null>(null);
  const [correctionEndedAt, setCorrectionEndedAt] = useState(() => toDatetimeLocal(null));
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);

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
        status: status === 'all' || status === 'stale_open' ? undefined : status,
        stale_open: status === 'stale_open' ? true : undefined,
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

  const driverNameById = useMemo(
    () => new Map(driverOptions.map((option) => [option.id, option.label])),
    [driverOptions],
  );

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
      const csv = sessionsToCsv(rows, `${t('workSessions.csvHeader')}\n`);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `work-sessions-${stamp}.csv`);
    } catch {
      setError(t('workSessions.exportError'));
    } finally {
      setExporting(false);
    }
  }

  function openCorrection(row: WorkSessionRow) {
    setSelectedRow(row);
    setCorrectionEndedAt(toDatetimeLocal(row.endedAt ?? row.lastSeenAt ?? row.startedAt));
    setCorrectionReason(row.correctionReason ?? '');
    setCorrectionNote('');
  }

  async function submitCorrection() {
    if (!selectedRow) {
      return;
    }
    setCorrectionBusy(true);
    setError(null);
    try {
      await workSessionsApi.correct(selectedRow.id, {
        ended_at: new Date(correctionEndedAt).toISOString(),
        reason: correctionReason.trim(),
        note: correctionNote.trim() || undefined,
      });
      setSelectedRow(null);
      await load();
    } catch {
      setError(t('workSessions.correctionError'));
    } finally {
      setCorrectionBusy(false);
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

      {/* Aylik Zeiterfassung: Soll/Ist/Pause/Uberstunden. Asagidaki vardiya
          listesi ham kayit olarak duruyor, silinmedi. */}
      <ZeiterfassungMonth />

      {/* Takografin gordugu ama kaydedilmemis dinlenmeler. Ayni filtreleri
          kullaniyor; aday yoksa kart hic cizilmiyor. */}
      <BreakCandidatePanel
        driverId={driverId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        driverNames={driverNameById}
      />

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
          <CardContent className="text-2xl font-bold">{formatFleetDurationMinutes(summary.totalMinutes, t)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t('workSessions.summary.avgSession')}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatFleetDurationMinutes(summary.avgMinutes, t)}</CardContent>
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
              <option value="stale_open">{t('workSessions.filter.staleOpen')}</option>
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
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className={FLEET_LIST_MOBILE}>
                {rows.map((row) => {
                  const minutes = durationMinutes(row.startedAt, row.endedAt);
                  const driverName = row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : row.driverId;
                  return (
                    <MobileDataCard
                      key={row.id}
                      title={driverName}
                      subtitle={formatFleetDateTime(row.startedAt)}
                      badge={
                        <div className="flex items-center gap-2">
                          {row.staleOpen ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                              <TriangleAlert className="h-3 w-3" />
                              {t('workSessions.filter.staleOpen')}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {t(`workSessions.status.${row.status}`)}
                          </span>
                        </div>
                      }
                    >
                      <MobileFieldGrid>
                        <MobileField
                          label={t('workSessions.col.duration')}
                          value={row.status === 'active' ? t('workSessions.status.active') : formatFleetDurationMinutes(minutes, t)}
                        />
                        <MobileField label={t('workSessions.col.ended')} value={formatFleetDateTime(row.endedAt)} />
                      </MobileFieldGrid>
                      <div className="mt-3 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => openCorrection(row)}>
                          {t('workSessions.correct')}
                        </Button>
                      </div>
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
                      <TableHead className={FLEET_TABLE_HEAD}>{t('workSessions.col.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {rows.length === 0 ? (
                      <TableRow className={FLEET_TABLE_ROW}>
                        <TableCell colSpan={7} className={cn(FLEET_TABLE_CELL_MUTED, 'py-10 text-center')}>
                          <EmptyState
                            icon={Loader2}
                            title={t('workSessions.emptyTitle', 'Keine Schichtdaten')}
                            subtitle={t('workSessions.empty')}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => {
                        const minutes = durationMinutes(row.startedAt, row.endedAt);
                        const driverName = row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : row.driverId;
                        return (
                          <TableRow key={row.id} className={FLEET_TABLE_ROW}>
                            <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{driverName}</TableCell>
                            <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatFleetDateTime(row.startedAt)}</TableCell>
                            <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatFleetDateTime(row.endedAt)}</TableCell>
                            <TableCell className={FLEET_TABLE_CELL}>
                              {row.status === 'active' ? t('workSessions.status.active') : formatFleetDurationMinutes(minutes, t)}
                            </TableCell>
                            <TableCell className={FLEET_TABLE_CELL_MUTED}>
                              {row.endReason ? t(`workSessions.endReason.${row.endReason}`) : '—'}
                            </TableCell>
                            <TableCell className={FLEET_TABLE_CELL}>
                              <div className="flex flex-col gap-1">
                                <span>{t(`workSessions.status.${row.status}`)}</span>
                                {row.staleOpen ? (
                                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                    <TriangleAlert className="h-3 w-3" />
                                    {t('workSessions.filter.staleOpen')}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className={FLEET_TABLE_CELL}>
                              <Button variant="outline" size="sm" onClick={() => openCorrection(row)}>
                                {t('workSessions.correct')}
                              </Button>
                            </TableCell>
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

      <Dialog open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('workSessions.correctDialogTitle')}</DialogTitle>
            <DialogDescription>{t('workSessions.correctDialogDescription')}</DialogDescription>
          </DialogHeader>
          {selectedRow ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {selectedRow.driver ? `${selectedRow.driver.firstName} ${selectedRow.driver.lastName}`.trim() : selectedRow.driverId}
                </p>
                <p>{formatFleetDateTime(selectedRow.startedAt)}</p>
              </div>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">{t('workSessions.correctEndedAt')}</span>
                <Input type="datetime-local" value={correctionEndedAt} onChange={(e) => setCorrectionEndedAt(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">{t('workSessions.correctReason')}</span>
                <Input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">{t('workSessions.correctNote')}</span>
                <textarea
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  rows={4}
                  className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-[#1a4d7a] focus:ring-2 focus:ring-[#1a4d7a]/15"
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRow(null)} disabled={correctionBusy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitCorrection()} disabled={correctionBusy || !correctionReason.trim() || !correctionEndedAt}>
              {correctionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('workSessions.correct')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
