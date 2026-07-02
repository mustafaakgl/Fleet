"use client";

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, FileUp, HardDriveDownload, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { driversApi, getApiErrorMessage, tachographApi, vehiclesApi } from '@/lib/api';
import { formatFleetDate, formatFleetDateTime } from '@/lib/locale-format';
import { showToast } from '@/lib/toast';
import type { DddFileListItem } from '@/lib/types';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function formatPeriod(row: DddFileListItem): string {
  if (!row.coveredPeriod.from && !row.coveredPeriod.to) {
    return '—';
  }
  const from = row.coveredPeriod.from ? formatFleetDate(row.coveredPeriod.from) : '—';
  const to = row.coveredPeriod.to ? formatFleetDate(row.coveredPeriod.to) : '—';
  return `${from} – ${to}`;
}

function signatureLabel(
  valid: boolean | null,
  t: (key: string) => string,
): { text: string; className: string; title?: string } {
  if (valid === true) {
    return { text: t('tachograph.dddArchive.signature.valid'), className: 'text-emerald-700' };
  }
  if (valid === false) {
    return {
      text: t('tachograph.dddArchive.signature.invalid'),
      className: 'text-red-700',
      title: t('tachograph.dddArchive.signature.invalidTooltip'),
    };
  }
  return { text: t('tachograph.dddArchive.signature.unverified'), className: 'text-slate-500' };
}

export default function DddArchivePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [vehicleId, setVehicleId] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [assignFileId, setAssignFileId] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', 'tachograph-upload-options'],
    queryFn: () => vehiclesApi.list(),
    staleTime: 60_000,
  });

  const driversQuery = useQuery({
    queryKey: ['drivers', 'ddd-assign'],
    queryFn: () => driversApi.list({ limit: 200 }),
    staleTime: 60_000,
  });

  const filesQuery = useQuery({
    queryKey: ['tachograph', 'ddd-files'],
    queryFn: () => tachographApi.listDddFiles(),
    staleTime: 15_000,
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !vehicleId) {
        throw new Error(t('tachograph.dddArchive.validation'));
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(t('tachograph.dddArchive.fileTooLarge'));
      }

      return tachographApi.uploadDddFile({
        file,
        vehicleId,
        capturedAt: capturedAt || undefined,
      });
    },
    onSuccess: (response) => {
      if (response.deduplicated) {
        showToast({ type: 'info', message: t('tachograph.dddArchive.dedupeToast') });
      } else {
        const parsed = response.parsed;
        showToast({
          type: response.file.signatureValid === false ? 'warning' : 'success',
          message: t('tachograph.dddArchive.uploadSuccess', {
            activities: parsed.activities.length,
            infringements: response.infringementsCreated,
          }),
        });
      }
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['tachograph', 'ddd-files'] });
    },
    onError: (error) => {
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, t('tachograph.dddArchive.uploadFailed')),
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!assignFileId || !assignDriverId) {
        throw new Error(t('tachograph.dddArchive.assignValidation'));
      }
      return tachographApi.assignDddFile(assignFileId, assignDriverId);
    },
    onSuccess: () => {
      showToast({ type: 'success', message: t('tachograph.dddArchive.assignSuccess') });
      setAssignFileId(null);
      setAssignDriverId('');
      void queryClient.invalidateQueries({ queryKey: ['tachograph', 'ddd-files'] });
    },
    onError: (error) => {
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, t('tachograph.dddArchive.assignFailed')),
      });
    },
  });

  const uploadError = uploadMutation.error
    ? getApiErrorMessage(uploadMutation.error, t('tachograph.dddArchive.uploadFailed'))
    : null;

  const listError = filesQuery.error
    ? getApiErrorMessage(filesQuery.error, t('tachograph.dddArchive.loadFailed'))
    : null;

  const vehicleOptions = useMemo(() => vehiclesQuery.data?.data ?? [], [vehiclesQuery.data]);
  const drivers = driversQuery.data?.data ?? [];
  const files = filesQuery.data ?? [];

  const archiveSummary = useMemo(() => {
    if (files.length === 0) {
      return null;
    }
    const totalBytes = files.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0);
    const oldest = files.reduce((min, row) => {
      const ts = new Date(row.capturedAt).getTime();
      return ts < min ? ts : min;
    }, Number.POSITIVE_INFINITY);
    return {
      count: files.length,
      mb: (totalBytes / (1024 * 1024)).toFixed(1),
      oldest: Number.isFinite(oldest) ? formatFleetDate(new Date(oldest).toISOString()) : '—',
    };
  }, [files]);

  async function copySha(sha256: string) {
    try {
      await navigator.clipboard.writeText(sha256);
      showToast({ type: 'info', message: t('tachograph.dddArchive.shaCopied') });
    } catch {
      showToast({ type: 'error', message: t('tachograph.dddArchive.shaCopyFailed') });
    }
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{t('nav.tachograph.dddArchive')}</h1>
          <p className="text-sm text-slate-600">{t('tachograph.dddArchive.subtitle')}</p>
        </div>
        {archiveSummary ? (
          <p className="text-xs text-slate-500 tabular-nums">
            {t('tachograph.dddArchive.archiveSummary', archiveSummary)}
          </p>
        ) : null}
      </div>

      <Card className={FLEET_LIST_CARD}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4" />
            {t('tachograph.dddArchive.uploadTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>{t('tachograph.dddArchive.vehicle')}</Label>
            <Select className="w-full" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">{t('tachograph.dddArchive.selectVehicle')}</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('tachograph.dddArchive.capturedAt')}</Label>
            <Input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>{t('tachograph.dddArchive.file')}</Label>
            <Input
              type="file"
              accept=".ddd,.DDD,.v1b,.V1B,application/octet-stream"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[10px] text-slate-500">{t('tachograph.dddArchive.uploadHint')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:col-span-4">
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending
                ? t('tachograph.dddArchive.uploading')
                : t('tachograph.dddArchive.uploadAction')}
            </Button>
            {file ? <span className="text-xs text-slate-500">{file.name}</span> : null}
          </div>

          {uploadError ? <p className="text-sm text-red-600 md:col-span-4">{uploadError}</p> : null}
        </CardContent>
      </Card>

      {listError ? (
        <EmptyState
          icon={ShieldAlert}
          title={t('common.error')}
          subtitle={listError}
          actionLabel={t('common.retry')}
          onAction={() => void filesQuery.refetch()}
        />
      ) : null}

      {!listError && files.length === 0 && !filesQuery.isLoading ? (
        <EmptyState
          icon={HardDriveDownload}
          title={t('tachograph.dddArchive.emptyTitle')}
          subtitle={t('tachograph.dddArchive.emptySubtitle')}
        />
      ) : null}

      {!listError && files.length > 0 ? (
        <Card className={FLEET_LIST_CARD}>
          <CardHeader>
            <CardTitle>{t('tachograph.dddArchive.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.createdAt')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.capturedAt')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.type')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.signature')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.generation')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.source')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.period')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.sha256')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.dddArchive.columns.size')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {files.map((row) => {
                  const sig = signatureLabel(row.signatureValid, t);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(FLEET_TABLE_ROW, row.signatureValid === false && 'bg-amber-50/80')}
                    >
                      <TableCell className={FLEET_TABLE_CELL}>{formatFleetDateTime(row.createdAt)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{formatFleetDateTime(row.capturedAt)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.fileType}</TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL, sig.className)} title={sig.title}>
                        {sig.text}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.generation != null ? (
                          <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums">
                            {row.generation}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {t(`tachograph.dddArchive.source.${row.source}`, row.source)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{formatPeriod(row)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px]" title={row.sha256}>
                          {row.sha256.slice(0, 12)}
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-700"
                            onClick={() => void copySha(row.sha256)}
                            aria-label={t('tachograph.dddArchive.copySha')}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </span>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.vehicle?.plateNumber ?? '—'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.driver ? (
                          `${row.driver.firstName} ${row.driver.lastName}`
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setAssignFileId(row.id)}
                          >
                            {t('tachograph.dddArchive.assignAction')}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {typeof row.sizeBytes === 'number'
                          ? `${(row.sizeBytes / 1024).toFixed(1)} KB`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={assignFileId !== null} onOpenChange={(open) => !open && setAssignFileId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tachograph.dddArchive.assignTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('tachograph.dddArchive.assignDriver')}</Label>
            <Select value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
              <option value="">{t('tachograph.dddArchive.selectDriver')}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.first_name} {driver.last_name}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignFileId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!assignDriverId || assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
            >
              {t('tachograph.dddArchive.assignConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
