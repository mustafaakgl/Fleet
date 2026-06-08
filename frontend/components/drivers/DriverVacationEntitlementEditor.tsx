'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { driversApi } from '@/lib/api';

interface DriverVacationEntitlementEditorProps {
  driverId: string;
  entitlementDays: number;
  carryOverDays: number;
  canEdit: boolean;
  compact?: boolean;
  onSaved?: (values: { entitlementDays: number; carryOverDays: number }) => void;
}

export function DriverVacationEntitlementEditor({
  driverId,
  entitlementDays,
  carryOverDays,
  canEdit,
  compact = false,
  onSaved,
}: DriverVacationEntitlementEditorProps) {
  const { t } = useTranslation();
  const [entitlement, setEntitlement] = useState(String(entitlementDays));
  const [carryOver, setCarryOver] = useState(String(carryOverDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntitlement(String(entitlementDays));
    setCarryOver(String(carryOverDays));
  }, [carryOverDays, driverId, entitlementDays]);

  if (!canEdit) {
    return (
      <div className={compact ? 'text-sm text-slate-600' : 'grid gap-3 sm:grid-cols-2'}>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('drivers.vacationEntitlement')}</p>
          <p className="mt-1 font-medium text-slate-900">{entitlementDays}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('drivers.vacationCarryOver')}</p>
          <p className="mt-1 font-medium text-slate-900">{carryOverDays}</p>
        </div>
      </div>
    );
  }

  async function handleSave() {
    const parsedEntitlement = Number(entitlement.replace(',', '.'));
    const parsedCarryOver = Number(carryOver.replace(',', '.'));
    if (!Number.isFinite(parsedEntitlement) || parsedEntitlement < 0 || parsedEntitlement > 365) {
      setError(t('drivers.vacationEntitlementInvalid'));
      return;
    }
    if (!Number.isFinite(parsedCarryOver) || parsedCarryOver < -365 || parsedCarryOver > 365) {
      setError(t('drivers.vacationCarryOverInvalid'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await driversApi.update(driverId, {
        vacation_entitlement_days: parsedEntitlement,
        vacation_carry_over_days: parsedCarryOver,
      });
      onSaved?.({ entitlementDays: parsedEntitlement, carryOverDays: parsedCarryOver });
    } catch {
      setError(t('drivers.vacationEntitlementSaveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className={`grid gap-3 ${compact ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-2'}`}>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('drivers.vacationEntitlement')}
          </span>
          <input
            type="number"
            step="0.5"
            min={0}
            max={365}
            value={entitlement}
            onChange={(event) => setEntitlement(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('drivers.vacationCarryOver')}
          </span>
          <input
            type="number"
            step="0.5"
            min={-365}
            max={365}
            value={carryOver}
            onChange={(event) => setCarryOver(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
          />
        </label>
        {compact && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
            </button>
          </div>
        )}
      </div>
      {!compact && (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('common.save')}
        </button>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
