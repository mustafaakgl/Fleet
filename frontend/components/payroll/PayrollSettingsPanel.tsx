'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  payrollApi,
  type DatevPayrollSystem,
  type PayrollDayType,
  type PayrollDayTypeMappingRow,
  type PayrollMovementType,
  type PayrollWageTypeMappingRow,
  type PublicHolidayRow,
} from '@/lib/api';

/** Gun ici dakika ↔ "HH:MM". Sunucu dakika tutuyor, insan saat okuyor. */
function minutesToTime(minutes: number): string {
  const safe = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

const DAY_TYPES: PayrollDayType[] = ['work', 'vacation', 'sick', 'holiday', 'off', 'absence_unpaid'];

/**
 * Kova sirasi ihracattaki sirayla ayni tutuluyor ki ekran dosyayi anlatsin.
 * `allowance`/`expense` LISTEDE YOK: hesap katmani henuz uretmiyor, eslemesini
 * istemek bos alan doldurtmak olurdu.
 */
const MOVEMENT_TYPES: PayrollMovementType[] = [
  'regular_hours',
  'overtime_hours',
  'night_hours',
  'night_core_hours',
  'sunday_hours',
  'holiday_hours',
  'vacation',
  'sickness',
  'unpaid_absence',
];

const PAYROLL_SYSTEMS: DatevPayrollSystem[] = ['lodas', 'lohn_und_gehalt'];

export function PayrollSettingsPanel() {
  const { t } = useTranslation();
  const [dayTypes, setDayTypes] = useState<PayrollDayTypeMappingRow[]>([]);
  const [unmappedCodes, setUnmappedCodes] = useState<string[]>([]);
  const [wageTypes, setWageTypes] = useState<PayrollWageTypeMappingRow[]>([]);
  const [holidays, setHolidays] = useState<PublicHolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    consultant: '',
    client: '',
    nightStart: '20:00',
    nightEnd: '06:00',
    coreStart: '00:00',
    coreEnd: '04:00',
    weeklyHours: '40',
    tachoTolerance: '15',
    payrollSystem: '' as DatevPayrollSystem | '',
  });
  /** Lohnart tablosu tek seferde tek urunu gosteriyor; planlar ayri. */
  const [wageSystem, setWageSystem] = useState<DatevPayrollSystem>('lodas');
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenant, dayTypeResult, wages, holidayRows] = await Promise.all([
        payrollApi.getTenantProfile(),
        payrollApi.listDayTypeMappings(),
        payrollApi.listWageTypeMappings(),
        payrollApi.listHolidays(String(new Date().getUTCFullYear())),
      ]);
      setDayTypes(dayTypeResult.mappings);
      setUnmappedCodes(dayTypeResult.unmappedCodes);
      setWageTypes(wages);
      setHolidays(holidayRows);
      if (tenant) {
        setForm({
          consultant: tenant.datevConsultantNumber ?? '',
          client: tenant.datevClientNumber ?? '',
          nightStart: minutesToTime(tenant.nightWindowStartMinute),
          nightEnd: minutesToTime(tenant.nightWindowEndMinute),
          coreStart: minutesToTime(tenant.nightCoreStartMinute),
          coreEnd: minutesToTime(tenant.nightCoreEndMinute),
          weeklyHours: String(Math.round(tenant.defaultWeeklyTargetMinutes / 60)),
          tachoTolerance: String(tenant.tachoBreakToleranceMinutes),
          payrollSystem: tenant.datevPayrollSystem ?? '',
        });
        if (tenant.datevPayrollSystem) setWageSystem(tenant.datevPayrollSystem);
      }
    } catch {
      setError(t('payroll.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    const nightStart = timeToMinutes(form.nightStart);
    const nightEnd = timeToMinutes(form.nightEnd);
    const coreStart = timeToMinutes(form.coreStart);
    const coreEnd = timeToMinutes(form.coreEnd);
    const weeklyHours = Number(form.weeklyHours);

    if (nightStart === null || nightEnd === null || coreStart === null || coreEnd === null) {
      setError(t('payroll.settings.invalidTime'));
      return;
    }
    if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 168) {
      setError(t('payroll.settings.invalidWeeklyHours'));
      return;
    }
    const tolerance = Number(form.tachoTolerance);
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 240) {
      setError(t('payroll.settings.invalidTolerance'));
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await payrollApi.saveTenantProfile({
        datevConsultantNumber: form.consultant.trim() || undefined,
        datevClientNumber: form.client.trim() || undefined,
        nightWindowStartMinute: nightStart,
        nightWindowEndMinute: nightEnd,
        nightCoreStartMinute: coreStart,
        nightCoreEndMinute: coreEnd,
        defaultWeeklyTargetMinutes: Math.round(weeklyHours * 60),
        tachoBreakToleranceMinutes: tolerance,
        datevPayrollSystem: form.payrollSystem || undefined,
      });
      setSaved(true);
      await load();
    } catch {
      setError(t('payroll.settings.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function saveWageType(
    movementType: PayrollMovementType,
    number: string,
    enabled: boolean,
  ) {
    setBusy(true);
    setError(null);
    try {
      await payrollApi.saveWageTypeMapping({
        payrollSystem: wageSystem,
        movementType,
        datevWageTypeNumber: number,
        enabled,
      });
      await load();
    } catch {
      setError(t('payroll.settings.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function saveDayType(calendarCode: string, dayType: PayrollDayType, paid: boolean) {
    setBusy(true);
    setError(null);
    try {
      await payrollApi.saveDayTypeMapping({ calendarCode, dayType, paid });
      await load();
    } catch {
      setError(t('payroll.settings.saveError'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-700">{t('payroll.settings.saved')}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.settings.tenantTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('payroll.settings.tenantHint')}</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{t('payroll.settings.consultantNumber')}</span>
            <Input
              value={form.consultant}
              onChange={(event) => setForm((f) => ({ ...f, consultant: event.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{t('payroll.settings.clientNumber')}</span>
            <Input
              value={form.client}
              onChange={(event) => setForm((f) => ({ ...f, client: event.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{t('payroll.settings.weeklyHours')}</span>
            <Input
              value={form.weeklyHours}
              onChange={(event) => setForm((f) => ({ ...f, weeklyHours: event.target.value }))}
            />
          </label>
          <label className="text-sm">
            {/* Gece penceresi gece yarisini asabilir: 20:00 → 06:00. */}
            <span className="mb-1 block text-slate-600">{t('payroll.settings.nightWindow')}</span>
            <div className="flex items-center gap-2">
              <Input
                value={form.nightStart}
                onChange={(event) => setForm((f) => ({ ...f, nightStart: event.target.value }))}
              />
              <span className="text-slate-500">–</span>
              <Input
                value={form.nightEnd}
                onChange={(event) => setForm((f) => ({ ...f, nightEnd: event.target.value }))}
              />
            </div>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{t('payroll.settings.nightCore')}</span>
            <div className="flex items-center gap-2">
              <Input
                value={form.coreStart}
                onChange={(event) => setForm((f) => ({ ...f, coreStart: event.target.value }))}
              />
              <span className="text-slate-500">–</span>
              <Input
                value={form.coreEnd}
                onChange={(event) => setForm((f) => ({ ...f, coreEnd: event.target.value }))}
              />
            </div>
          </label>
          <label className="text-sm">
            {/* Ihracat bunu bilmeden dosya uretemez; hazirlik dogrulamasi bos
                birakilirsa donemi DATEV-hazir saymiyor. */}
            <span className="mb-1 block text-slate-600">{t('payroll.settings.payrollSystem')}</span>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={form.payrollSystem}
              onChange={(event) =>
                setForm((f) => ({ ...f, payrollSystem: event.target.value as DatevPayrollSystem | '' }))
              }
            >
              <option value="">{t('payroll.settings.payrollSystemNone')}</option>
              {PAYROLL_SYSTEMS.map((system) => (
                <option key={system} value={system}>
                  {t(`payroll.system.${system}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {/* Surucu dugmeye basmayi geciktirir, takograf aracin durusundan
                sayar; bu esigin ustundeki fark incelenir. */}
            <span className="mb-1 block text-slate-600">{t('payroll.settings.tachoTolerance')}</span>
            <Input
              value={form.tachoTolerance}
              onChange={(event) => setForm((f) => ({ ...f, tachoTolerance: event.target.value }))}
            />
          </label>
          <div className="flex items-end">
            <Button disabled={busy} onClick={() => void saveProfile()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('payroll.settings.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.settings.wageTypesTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('payroll.settings.wageTypesHint')}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* LODAS ile Lohn und Gehalt ayni Lohnart planini kullanmak zorunda
              degil; tablo tek seferde tek urunu gosteriyor. */}
          <label className="mb-2 flex items-center gap-2 text-sm">
            <span className="text-slate-600">{t('payroll.settings.payrollSystem')}</span>
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
              value={wageSystem}
              onChange={(event) => setWageSystem(event.target.value as DatevPayrollSystem)}
            >
              {PAYROLL_SYSTEMS.map((system) => (
                <option key={system} value={system}>
                  {t(`payroll.system.${system}`)}
                </option>
              ))}
            </select>
          </label>

          {MOVEMENT_TYPES.map((movementType) => {
            // Ayni tur icin birden fazla surum olabilir; ekranda EN GUNCEL
            // olan duzenleniyor.
            const existing = wageTypes
              .filter((row) => row.payrollSystem === wageSystem && row.movementType === movementType)
              .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
            return (
              <WageTypeRow
                key={`${wageSystem}-${movementType}`}
                movementType={movementType}
                value={existing?.datevWageTypeNumber ?? ''}
                enabled={existing?.enabled ?? true}
                busy={busy}
                onSave={(number, enabled) => void saveWageType(movementType, number, enabled)}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.settings.dayTypesTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('payroll.settings.dayTypesHint')}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {unmappedCodes.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{t('payroll.settings.unmappedWarning')}</p>
                <p className="mt-1 font-medium">{unmappedCodes.join(', ')}</p>
              </div>
            </div>
          ) : null}
          {[...unmappedCodes.map((code) => ({ code, row: undefined as PayrollDayTypeMappingRow | undefined })),
            ...dayTypes.map((row) => ({ code: row.calendarCode, row }))].map(({ code, row }) => (
            <DayTypeRow
              key={code}
              calendarCode={code}
              dayType={row?.dayType}
              paid={row?.paid ?? true}
              busy={busy}
              onSave={(dayType, paid) => void saveDayType(code, dayType, paid)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('payroll.settings.holidaysTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('payroll.settings.holidaysHint')}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t('payroll.settings.holidayDate')}</span>
              <Input
                type="date"
                value={newHoliday.date}
                onChange={(event) => setNewHoliday((h) => ({ ...h, date: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t('payroll.settings.holidayName')}</span>
              <Input
                value={newHoliday.name}
                onChange={(event) => setNewHoliday((h) => ({ ...h, name: event.target.value }))}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy || !newHoliday.date || !newHoliday.name.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await payrollApi.saveHoliday({ date: newHoliday.date, name: newHoliday.name.trim() });
                  setNewHoliday({ date: '', name: '' });
                  await load();
                } catch {
                  setError(t('payroll.settings.saveError'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('payroll.settings.holidayAdd')}
            </Button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-sm text-slate-600">{t('payroll.settings.holidaysEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {holidays.map((holiday) => (
                <li key={holiday.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="tabular-nums">{holiday.date.slice(0, 10)}</span>{' '}
                    <span className="text-slate-700">{holiday.name}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('payroll.settings.holidayRemove')}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await payrollApi.deleteHoliday(holiday.id);
                        await load();
                      } catch {
                        setError(t('payroll.settings.saveError'));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WageTypeRow({
  movementType,
  value,
  enabled,
  busy,
  onSave,
}: {
  movementType: PayrollMovementType;
  value: string;
  enabled: boolean;
  busy: boolean;
  onSave: (number: string, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [draftEnabled, setDraftEnabled] = useState(enabled);

  useEffect(() => {
    setDraft(value);
    setDraftEnabled(enabled);
  }, [value, enabled]);

  const dirty = draft !== value || draftEnabled !== enabled;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-48 text-sm text-slate-700">{t(`payroll.movementType.${movementType}`)}</span>
      <Input
        className="w-32"
        value={draft}
        placeholder={t('payroll.settings.wageTypeNumber')}
        onChange={(event) => setDraft(event.target.value)}
      />
      <label className="flex items-center gap-1 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={draftEnabled}
          onChange={(event) => setDraftEnabled(event.target.checked)}
        />
        {t('payroll.settings.wageTypeEnabled')}
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !dirty || !draft.trim()}
        onClick={() => onSave(draft.trim(), draftEnabled)}
      >
        {t('payroll.settings.save')}
      </Button>
    </div>
  );
}

function DayTypeRow({
  calendarCode,
  dayType,
  paid,
  busy,
  onSave,
}: {
  calendarCode: string;
  dayType: PayrollDayType | undefined;
  paid: boolean;
  busy: boolean;
  onSave: (dayType: PayrollDayType, paid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [draftType, setDraftType] = useState<PayrollDayType>(dayType ?? 'work');
  const [draftPaid, setDraftPaid] = useState(paid);

  useEffect(() => {
    setDraftType(dayType ?? 'work');
    setDraftPaid(paid);
  }, [dayType, paid]);

  const dirty = !dayType || draftType !== dayType || draftPaid !== paid;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-32 font-mono text-sm text-slate-700">{calendarCode}</span>
      {!dayType ? (
        <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">
          {t('payroll.settings.unmappedBadge')}
        </span>
      ) : null}
      <select
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
        value={draftType}
        onChange={(event) => setDraftType(event.target.value as PayrollDayType)}
      >
        {DAY_TYPES.map((option) => (
          <option key={option} value={option}>
            {t(`workTime.dayType.${option}`)}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={draftPaid}
          onChange={(event) => setDraftPaid(event.target.checked)}
        />
        {t('payroll.settings.dayTypePaid')}
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !dirty}
        onClick={() => onSave(draftType, draftPaid)}
      >
        {t('payroll.settings.save')}
      </Button>
    </div>
  );
}
