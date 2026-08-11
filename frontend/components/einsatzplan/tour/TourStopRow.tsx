'use client';

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AddressPickerFields } from '@/components/shared/AddressPickerFields';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PickedLocation } from '@/lib/api';
import type { TourBuilderStop } from '@/lib/tour-builder';

interface TourStopRowProps {
  stop: TourBuilderStop;
  index: number;
  total: number;
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<TourBuilderStop>) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
}

/**
 * Tur kurma formundaki tek durak.
 *
 * KAPALI HALDE TEK SATIR: numara, adres, durakta gecen sure. Dokuz duragin
 * tum alanlarini acik tutmak 36 giris kutusu demek ve ucuncu duraktan sonra
 * ekran okunmaz oluyor. Detay yalnizca acilan durakta gorunur.
 *
 * Siralama iki yoldan yapilabiliyor: surukleme ve yukari/asagi dugmeleri.
 * Dugmeler sus degil — klavyeyle calisan tek yol onlar, ve dokunmatikte
 * surukleme guvenilmez.
 */
export function TourStopRow({
  stop,
  index,
  total,
  expanded,
  disabled,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: TourStopRowProps) {
  const { t } = useTranslation();
  const blocked = stop.location?.truckAccess === 'unreachable';

  return (
    <li
      data-testid="tour-stop-row"
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', String(index));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData('text/plain'));
        if (Number.isInteger(from)) {
          onMove(from);
        }
      }}
      className={cn(
        'rounded-md border bg-white',
        blocked ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2 p-2">
        <span aria-hidden className="cursor-grab text-slate-400" title={t('tourBuilder.dragHint')}>
          <GripVertical className="h-4 w-4" />
        </span>

        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
            blocked ? 'bg-rose-600' : 'bg-brand-primary',
          )}
        >
          {index + 1}
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              stop.location ? 'text-slate-900' : 'text-slate-400',
            )}
          >
            {stop.location?.rawAddress || t('tourBuilder.stopEmpty')}
          </span>
          {stop.serviceMinutes > 0 ? (
            <span className="shrink-0 text-xs text-slate-500">
              {stop.serviceMinutes} {t('tourBuilder.minuteShort')}
            </span>
          ) : null}
          {blocked ? (
            <span className="shrink-0 text-xs font-medium text-rose-700">
              {t('tourBuilder.stopBlocked')}
            </span>
          ) : null}
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={disabled || index === 0}
            onClick={() => onMove(index - 1)}
            aria-label={t('tourBuilder.moveUp')}
            className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled || index === total - 1}
            onClick={() => onMove(index + 1)}
            aria-label={t('tourBuilder.moveDown')}
            className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            aria-label={t('tourBuilder.removeStop')}
            className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-2 border-t border-slate-200 p-3 pl-10">
          <AddressPickerFields
            label={t('tourBuilder.stopAddress')}
            value={stop.location?.rawAddress ?? ''}
            onChange={() => {
              // Metin degisikligi tek basina secim sayilmaz; secim
              // onLocationChange ile gelir. Kullanici yazmaya donerse
              // location null olur ve form dogrulamasi bunu yakalar.
            }}
            onLocationChange={(location: PickedLocation | null) => onChange({ location })}
            disabled={disabled}
          />

          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs font-medium text-slate-600">
              {t('tourBuilder.serviceMinutes')}
              <Input
                type="number"
                min={0}
                max={1440}
                value={stop.serviceMinutes || ''}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ serviceMinutes: Math.max(0, Number(event.target.value) || 0) })
                }
                className="mt-1"
              />
            </label>

            <label className="text-xs font-medium text-slate-600">
              {t('tourBuilder.windowStart')}
              <Input
                type="time"
                value={stop.windowStart}
                disabled={disabled}
                onChange={(event) => onChange({ windowStart: event.target.value })}
                className="mt-1"
              />
            </label>

            <label className="text-xs font-medium text-slate-600">
              {t('tourBuilder.windowEnd')}
              <Input
                type="time"
                value={stop.windowEnd}
                disabled={disabled}
                onChange={(event) => onChange({ windowEnd: event.target.value })}
                className="mt-1"
              />
            </label>

            <label className="text-xs font-medium text-slate-600">
              {t('tourBuilder.note')}
              <Input
                value={stop.note}
                disabled={disabled}
                placeholder={t('tourBuilder.notePlaceholder')}
                onChange={(event) => onChange({ note: event.target.value })}
                className="mt-1"
              />
            </label>
          </div>
        </div>
      ) : null}
    </li>
  );
}
