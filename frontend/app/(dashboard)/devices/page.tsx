'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, Link2, Link2Off, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { devicesApi, getApiErrorMessage, vehiclesApi } from '@/lib/api';
import { formatFleetDateTime } from '@/lib/locale-format';
import type { CreateDevicePayload, DeviceModel, DeviceRow, UpdateDevicePayload } from '@/lib/types';

const ONLINE_STATUSES = new Set(['online']);
const OFFLINE_STATUSES = new Set(['offline']);

function statusBadgeClass(status: DeviceRow['status']): string {
  if (ONLINE_STATUSES.has(status)) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (OFFLINE_STATUSES.has(status)) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-slate-100 text-slate-600';
}

function modelOptions(): DeviceModel[] {
  return ['FMC130', 'FMC650'];
}

export default function DevicesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [imei, setImei] = useState('');
  const [model, setModel] = useState<DeviceModel>('FMC130');
  const [vehicleId, setVehicleId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({});

  const vehiclesQuery = useQuery({
    queryKey: ['devices', 'vehicle-options'],
    queryFn: () => vehiclesApi.list({ page: 1, limit: 200 }),
    staleTime: 60_000,
  });

  const devicesQuery = useQuery({
    queryKey: ['devices', 'list'],
    queryFn: () => devicesApi.list(),
    staleTime: 10_000,
  });

  const unassignedQuery = useQuery({
    queryKey: ['devices', 'unassigned'],
    queryFn: () => devicesApi.listUnassigned(),
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateDevicePayload) => devicesApi.create(payload),
    onSuccess: () => {
      resetForm();
      void invalidateDeviceQueries();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDevicePayload }) =>
      devicesApi.update(id, payload),
    onSuccess: () => {
      resetForm();
      void invalidateDeviceQueries();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => devicesApi.remove(id),
    onSuccess: () => {
      if (editingId) {
        resetForm();
      }
      void invalidateDeviceQueries();
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, targetVehicleId }: { id: string; targetVehicleId: string }) =>
      devicesApi.update(id, { vehicleId: targetVehicleId }),
    onSuccess: () => {
      setAssignSelections({});
      void invalidateDeviceQueries();
    },
  });

  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  const unassigned = useMemo(() => unassignedQuery.data ?? [], [unassignedQuery.data]);
  const vehicles = useMemo(() => vehiclesQuery.data?.data ?? [], [vehiclesQuery.data]);

  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter((row) => row.status === 'online').length;
    const offline = devices.filter((row) => row.status === 'offline').length;
    const unmatched = devices.filter((row) => !row.vehicleId).length;
    return { total, online, offline, unmatched };
  }, [devices]);

  const loadError = devicesQuery.error
    ? getApiErrorMessage(devicesQuery.error, t('devices.loadFailed'))
    : null;

  const saveError = createMutation.error || updateMutation.error
    ? getApiErrorMessage(createMutation.error ?? updateMutation.error, t('devices.saveFailed'))
    : null;

  const deleteError = deleteMutation.error
    ? getApiErrorMessage(deleteMutation.error, t('devices.deleteFailed'))
    : null;

  const assignError = assignMutation.error
    ? getApiErrorMessage(assignMutation.error, t('devices.assignFailed'))
    : null;

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLoading = devicesQuery.isLoading;

  function resetForm() {
    setImei('');
    setModel('FMC130');
    setVehicleId('');
    setEditingId(null);
  }

  function beginEdit(row: DeviceRow) {
    setEditingId(row.id);
    setImei(row.imei);
    setModel(row.model);
    setVehicleId(row.vehicleId ?? '');
  }

  async function invalidateDeviceQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['devices', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['devices', 'unassigned'] }),
    ]);
  }

  async function onSubmit() {
    if (!imei.trim()) {
      return;
    }

    if (editingId) {
      await updateMutation.mutateAsync({
        id: editingId,
        payload: {
          model,
          vehicleId: vehicleId || null,
        },
      });
      return;
    }

    await createMutation.mutateAsync({
      imei: imei.trim(),
      model,
      vehicleId: vehicleId || undefined,
    });
  }

  async function onDelete(id: string) {
    if (!window.confirm(t('devices.confirmDelete'))) {
      return;
    }
    await deleteMutation.mutateAsync(id);
  }

  async function onAssign(row: DeviceRow) {
    const selected = assignSelections[row.id];
    if (!selected) {
      return;
    }
    await assignMutation.mutateAsync({ id: row.id, targetVehicleId: selected });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Cpu className="h-6 w-6 text-slate-700" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('devices.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('devices.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('devices.kpi.total')} value={stats.total} />
        <StatCard label={t('devices.kpi.online')} value={stats.online} />
        <StatCard label={t('devices.kpi.offline')} value={stats.offline} />
        <StatCard label={t('devices.kpi.unmatched')} value={stats.unmatched} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? t('devices.editTitle') : t('devices.addTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label>{t('devices.form.imei')}</Label>
            <Input
              value={imei}
              onChange={(event) => setImei(event.target.value)}
              placeholder="352093089999111"
              disabled={Boolean(editingId)}
            />
          </div>

          <div className="space-y-1">
            <Label>{t('devices.form.model')}</Label>
            <Select value={model} onChange={(event) => setModel(event.target.value as DeviceModel)}>
              {modelOptions().map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>{t('devices.form.vehicle')}</Label>
            <Select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              <option value="">{t('devices.form.noVehicle')}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void onSubmit()}
              disabled={isSaving || !imei.trim()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {editingId ? t('devices.actions.saveEdit') : t('devices.actions.add')}
            </Button>
            {editingId ? (
              <Button variant="outline" onClick={resetForm}>
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>

          {saveError ? <p className="md:col-span-4 text-sm text-red-600">{saveError}</p> : null}
          {deleteError ? <p className="md:col-span-4 text-sm text-red-600">{deleteError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2Off className="h-4 w-4" />
            {t('devices.unassigned.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignError ? <p className="text-sm text-red-600">{assignError}</p> : null}

          {unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('devices.unassigned.empty')}</p>
          ) : (
            <div className="space-y-2">
              {unassigned.map((row) => (
                <div key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.imei}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('devices.unassigned.lastSeen')}: {formatFleetDateTime(row.lastSeenAt)}
                    </p>
                  </div>

                  <div className="flex w-full items-center gap-2 md:w-auto">
                    <Select
                      value={assignSelections[row.id] ?? ''}
                      onChange={(event) =>
                        setAssignSelections((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t('devices.unassigned.selectVehicle')}</option>
                      {vehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate_number}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => void onAssign(row)}
                      disabled={!assignSelections[row.id] || assignMutation.isPending}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      {t('devices.unassigned.assign')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('devices.table.title')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : loadError ? (
            <EmptyState
              icon={Cpu}
              title={t('devices.loadErrorTitle')}
              subtitle={loadError}
              actionLabel={t('common.retry')}
              onAction={() => void devicesQuery.refetch()}
            />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title={t('devices.emptyTitle')}
              subtitle={t('devices.emptySubtitle')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('devices.table.imei')}</TableHead>
                  <TableHead>{t('devices.table.model')}</TableHead>
                  <TableHead>{t('devices.table.vehicle')}</TableHead>
                  <TableHead>{t('devices.table.status')}</TableHead>
                  <TableHead>{t('devices.table.lastSeen')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.imei}</TableCell>
                    <TableCell>{row.model}</TableCell>
                    <TableCell>{row.plateNumber ?? '-'}</TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(row.status)}>
                        {t(`devices.status.${row.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatFleetDateTime(row.lastSeenAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => beginEdit(row)}>
                          {t('common.edit')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void onDelete(row.id)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
