'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HandoverPhotoPreview } from '@/components/handovers/HandoverPhotoPreview';
import { HANDOVER_PHOTO_SLOTS } from '@/lib/driver-portal-utils';
import type { DriverHandoverPhotoSlot } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export type VehicleHandoverHistoryRow = {
  id: string;
  handoverDateTime: string;
  handoverType: string;
  photoRequired: boolean;
  photoStatus: string;
  damageDetected: boolean;
  damageNotes?: string | null;
  status: string;
  driver?: { firstName: string; lastName: string };
  photos?: Partial<
    Record<
      DriverHandoverPhotoSlot,
      {
        id: string;
        fileName: string;
        download_url?: string | null;
        validationStatus?: 'validated' | 'location_mismatch';
      }
    >
  >;
};

function slotLabelKey(slot: DriverHandoverPhotoSlot): string {
  return `driverPortal.handover.slot_${slot}`;
}

function photoStatusLabel(t: (key: string) => string, value: string): string {
  if (value === 'not_required') return t('handover.photoNotRequired');
  if (value === 'uploaded' || value === 'approved') return t('handover.photoUploaded');
  if (value === 'missing') return t('handover.photoMissing');
  if (value === 'rejected') return t('handover.photoRejected');
  return value.replace(/_/g, ' ');
}

export function VehicleHandoverHistory({ handovers }: { handovers: VehicleHandoverHistoryRow[] }) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(
    handovers.find((row) => row.photoRequired)?.id ?? null,
  );

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, VehicleHandoverHistoryRow[]>();
    for (const row of handovers) {
      const dayKey = row.handoverDateTime.slice(0, 10);
      const bucket = groups.get(dayKey) ?? [];
      bucket.push(row);
      groups.set(dayKey, bucket);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [handovers]);

  if (handovers.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-gray-500">{t('common.noRecords')}</p>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {groupedByDay.map(([dayKey, dayRows]) => (
        <div key={dayKey} className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {formatDate(dayKey)}
          </p>
          <div className="space-y-3">
            {dayRows.map((row) => {
              const expanded = expandedId === row.id;
              const photoCount = row.photoRequired
                ? HANDOVER_PHOTO_SLOTS.filter((slot) => row.photos?.[slot]).length
                : 0;

              return (
                <div key={row.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {row.driver
                          ? `${row.driver.firstName} ${row.driver.lastName}`
                          : t('vehicleDetail.driver')}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.handoverType} · {photoStatusLabel(t, row.photoStatus)} · {row.status}
                        {row.photoRequired
                          ? ` · ${t('vehicleDetail.handoverPhotoCount', {
                              count: photoCount,
                              total: HANDOVER_PHOTO_SLOTS.length,
                            })}`
                          : ''}
                      </p>
                    </div>
                    {row.damageDetected ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {t('vehicleDetail.colDamage')}
                      </span>
                    ) : null}
                  </button>

                  {expanded ? (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                      {row.damageDetected && row.damageNotes ? (
                        <p className="mb-3 text-sm text-amber-900">{row.damageNotes}</p>
                      ) : null}
                      {row.photoRequired ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {HANDOVER_PHOTO_SLOTS.map((slot) => (
                            <HandoverPhotoPreview
                              key={slot}
                              slot={slot}
                              photo={row.photos?.[slot]}
                              slotLabel={t(slotLabelKey(slot))}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600">{t('vehicleDetail.handoverNoPhotosRequired')}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
