'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { payrollApi, type DriverPayrollProfileRow } from '@/lib/api';

/**
 * Surucu bordro profilleri.
 *
 * Personel numarasi olmayan surucu bordroya GIREMEZ ve donem onayi bu yuzden
 * reddediliyor; liste bu eksigi en uste tasiyor ki onay anina kadar surpriz
 * olmasin.
 */
export function PayrollDriversPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DriverPayrollProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await payrollApi.listDriverProfiles());
    } catch {
      setError(t('payroll.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(
    driverId: string,
    payload: { datevPersonnelNumber: string; weeklyTargetMinutes?: number; costCenter?: string },
  ) {
    setBusy(true);
    setError(null);
    try {
      await payrollApi.saveDriverProfile(driverId, payload);
      await load();
    } catch (caught) {
      const code = (caught as { response?: { data?: { message?: string } } })?.response?.data?.message;
      // Ayni personel numarasi ikinci suruculye verilirse sunucu reddediyor;
      // sebebi yazmazsak kullanici neden kaydedilmedigini bilemez.
      setError(code ?? t('payroll.settings.saveError'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const missing = rows.filter((row) => !row.ready);

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {missing.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('payroll.drivers.missingWarning', { count: missing.length })}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.drivers.title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('payroll.drivers.hint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <DriverRow key={row.driverId} row={row} busy={busy} onSave={save} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DriverRow({
  row,
  busy,
  onSave,
}: {
  row: DriverPayrollProfileRow;
  busy: boolean;
  onSave: (
    driverId: string,
    payload: { datevPersonnelNumber: string; weeklyTargetMinutes?: number; costCenter?: string },
  ) => void;
}) {
  const { t } = useTranslation();
  const [personnelNumber, setPersonnelNumber] = useState(row.profile?.datevPersonnelNumber ?? '');
  const [weeklyHours, setWeeklyHours] = useState(
    row.profile?.weeklyTargetMinutes ? String(Math.round(row.profile.weeklyTargetMinutes / 60)) : '',
  );
  const [costCenter, setCostCenter] = useState(row.profile?.costCenter ?? '');

  const originalHours = row.profile?.weeklyTargetMinutes
    ? String(Math.round(row.profile.weeklyTargetMinutes / 60))
    : '';
  const dirty =
    personnelNumber !== (row.profile?.datevPersonnelNumber ?? '') ||
    weeklyHours !== originalHours ||
    costCenter !== (row.profile?.costCenter ?? '');

  const parsedHours = weeklyHours.trim() ? Number(weeklyHours) : undefined;
  const hoursValid =
    parsedHours === undefined || (Number.isFinite(parsedHours) && parsedHours > 0 && parsedHours <= 168);

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3 last:border-0">
      <div className="w-48">
        <p className="text-sm font-medium text-slate-900">
          {row.lastName} {row.firstName}
        </p>
        <p className="text-xs text-slate-500">{row.employeeNumber}</p>
        {/* Profil surumlu: personel numarasi degisince yeni surum aciliyor ve
            gecmis donem O TARIHTEKI numarayla uretiliyor. */}
        {row.versionCount > 1 ? (
          <p className="text-xs text-slate-500">
            {t('payroll.drivers.versions', { count: row.versionCount })}
          </p>
        ) : null}
        {row.profile ? (
          <p className="text-xs text-slate-400">
            {t('payroll.drivers.validFrom', { date: row.profile.validFrom.slice(0, 10) })}
          </p>
        ) : null}
      </div>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-600">{t('payroll.drivers.personnelNumber')}</span>
        <Input
          className="w-32"
          value={personnelNumber}
          onChange={(event) => setPersonnelNumber(event.target.value)}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-600">{t('payroll.drivers.weeklyHours')}</span>
        <Input
          className="w-24"
          value={weeklyHours}
          placeholder={t('payroll.drivers.weeklyHoursDefault')}
          onChange={(event) => setWeeklyHours(event.target.value)}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-600">{t('payroll.drivers.costCenter')}</span>
        <Input
          className="w-32"
          value={costCenter}
          onChange={(event) => setCostCenter(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !dirty || !personnelNumber.trim() || !hoursValid}
        onClick={() =>
          onSave(row.driverId, {
            datevPersonnelNumber: personnelNumber.trim(),
            weeklyTargetMinutes: parsedHours ? Math.round(parsedHours * 60) : undefined,
            costCenter: costCenter.trim() || undefined,
          })
        }
      >
        {t('payroll.settings.save')}
      </Button>
      {dirty && personnelNumber !== (row.profile?.datevPersonnelNumber ?? '') && row.profile ? (
        // Kaydetmeden once soyluyoruz: numara degisimi surum acar, ustune yazmaz.
        <p className="w-full text-xs text-amber-700">{t('payroll.drivers.willVersion')}</p>
      ) : null}
    </div>
  );
}
