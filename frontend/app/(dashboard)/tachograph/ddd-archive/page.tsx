"use client";

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileUp, HardDriveDownload, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, tachographApi, vehiclesApi } from '@/lib/api';
import { formatFleetDateTime } from '@/lib/locale-format';

export default function DddArchivePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [vehicleId, setVehicleId] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [resultNotice, setResultNotice] = useState<string | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', 'tachograph-upload-options'],
    queryFn: () => vehiclesApi.list(),
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

      return tachographApi.uploadDddFile({
        file,
        vehicleId,
        capturedAt: capturedAt || undefined,
      });
    },
    onSuccess: (response) => {
      const parsed = response.parsed;
      const warningCount = parsed.warnings.length;
      setResultNotice(
        t('tachograph.dddArchive.uploadSuccess', {
          activities: parsed.activities.length,
          infringements: response.infringementsCreated,
          warnings: warningCount,
        }),
      );
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['tachograph', 'ddd-files'] });
    },
  });

  const uploadError = uploadMutation.error
    ? getApiErrorMessage(uploadMutation.error, t('tachograph.dddArchive.uploadFailed'))
    : null;

  const listError = filesQuery.error
    ? getApiErrorMessage(filesQuery.error, t('tachograph.dddArchive.loadFailed'))
    : null;

  const vehicleOptions = useMemo(() => vehiclesQuery.data?.data ?? [], [vehiclesQuery.data]);
  const files = filesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.tachograph.dddArchive')}</h1>
        <p className="text-sm text-muted-foreground">{t('tachograph.dddArchive.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4" />
            {t('tachograph.dddArchive.uploadTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>{t('tachograph.dddArchive.vehicle')}</Label>
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
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
              accept=".ddd,application/octet-stream"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="md:col-span-4 flex items-center gap-3">
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending
                ? t('tachograph.dddArchive.uploading')
                : t('tachograph.dddArchive.uploadAction')}
            </Button>
            {file ? <span className="text-xs text-muted-foreground">{file.name}</span> : null}
          </div>

          {resultNotice ? (
            <p className="md:col-span-4 text-sm text-emerald-700">{resultNotice}</p>
          ) : null}
          {uploadError ? (
            <p className="md:col-span-4 text-sm text-red-600">{uploadError}</p>
          ) : null}
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
        <Card>
          <CardHeader>
            <CardTitle>{t('tachograph.dddArchive.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tachograph.dddArchive.columns.createdAt')}</TableHead>
                  <TableHead>{t('tachograph.dddArchive.columns.capturedAt')}</TableHead>
                  <TableHead>{t('tachograph.dddArchive.columns.type')}</TableHead>
                  <TableHead>{t('tachograph.dddArchive.columns.vehicle')}</TableHead>
                  <TableHead>{t('tachograph.dddArchive.columns.driver')}</TableHead>
                  <TableHead>{t('tachograph.dddArchive.columns.size')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatFleetDateTime(row.createdAt)}</TableCell>
                    <TableCell>{formatFleetDateTime(row.capturedAt)}</TableCell>
                    <TableCell>{row.fileType}</TableCell>
                    <TableCell>{row.vehicle?.plateNumber ?? '-'}</TableCell>
                    <TableCell>
                      {row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : '-'}
                    </TableCell>
                    <TableCell>
                      {typeof row.sizeBytes === 'number'
                        ? `${(row.sizeBytes / 1024).toFixed(1)} KB`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
