'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Route, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { showToast } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/api';
import {
  assignmentsApi,
  toursApi,
  type OptimizeTourResult,
  type TourDetail,
  type TourListItem,
} from '@/lib/api';
import type { Assignment } from '@/lib/types';
import { TourResultPanel } from './tour/TourResultPanel';

/**
 * Ofis tur planlama paneli.
 *
 * Akis bilincli olarak iki adimli: dispatcher once turu kurar ve mevcut sirayi
 * gorur, sonra optimizasyonu calistirip "once/sonra" karsilastirmasina bakar.
 * Sonuc otomatik uygulanmaz — planlamaci kabul etmeden surucuye acilmaz.
 */
export function TourPlanningPanel({ date }: { date: string }) {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tours, setTours] = useState<TourListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tourName, setTourName] = useState('');
  const [activeTour, setActiveTour] = useState<TourDetail | null>(null);
  const [lastResult, setLastResult] = useState<OptimizeTourResult | null>(null);
  const [busy, setBusy] = useState<'create' | 'optimize' | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [assignmentList, tourList] = await Promise.all([
        assignmentsApi.list({ date, limit: 200 }),
        toursApi.list(date),
      ]);
      setAssignments(assignmentList.data ?? []);
      setTours(tourList.tours);
    } catch (error) {
      showToast({ message: getApiErrorMessage(error, t('tours.loadFailed')), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createTour() {
    if (selected.size === 0) return;
    setBusy('create');
    try {
      const tour = await toursApi.create({
        assignment_ids: [...selected],
        work_date: date,
        name: tourName.trim() || undefined,
      });
      setActiveTour(tour);
      setLastResult(null);
      setSelected(new Set());
      setTourName('');
      await reload();
      showToast({ message: t('tours.created'), type: 'success' });
    } catch (error) {
      // Sunucu koordinati eksik gorevleri id'leriyle bildiriyor; mesaji
      // oldugu gibi gostermek dispatcher'in hangi gorevi duzeltecegini soyler.
      showToast({ message: getApiErrorMessage(error, t('tours.createFailed')), type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function optimize(tourId: string) {
    setBusy('optimize');
    try {
      const result = await toursApi.optimize(tourId);
      setLastResult(result);
      setActiveTour(result.tour);
      await reload();
      if (!result.optimized) {
        // Hata degil: sira korunmus. Kullaniciya sebebi gosteriyoruz.
        showToast({
          message: result.reasonCode
            ? t(`tours.skip.${result.reasonCode}`)
            : t('tours.notOptimized'),
          type: 'warning',
        });
      }
    } catch (error) {
      showToast({ message: getApiErrorMessage(error, t('tours.optimizeFailed')), type: 'error' });
    } finally {
      setBusy(null);
    }
  }



  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-4 w-4" />
            {t('tours.buildTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tours.noAssignments')}</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-auto rounded-md border p-2">
              {assignments.map((assignment) => (
                <label
                  key={assignment.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(assignment.id)}
                    onChange={() => toggle(assignment.id)}
                  />
                  <span className="truncate">
                    {assignment.pickup_address} → {assignment.delivery_address}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={tourName}
              onChange={(event) => setTourName(event.target.value)}
              placeholder={t('tours.namePlaceholder')}
              className="max-w-xs"
            />
            <Button onClick={() => void createTour()} disabled={selected.size === 0 || busy !== null}>
              {busy === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('tours.create', { count: selected.size })}
            </Button>
          </div>
        </CardContent>
      </Card>

      {tours.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('tours.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tours.map((tour) => (
              <div
                key={tour.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{tour.name ?? t('tours.untitled')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('tours.meta', {
                      stops: tour.stopCount,
                      status: t(`tours.status.${tour.status}`),
                    })}
                    {tour.plannedDistanceKm !== null
                      ? ` · ${tour.plannedDistanceKm.toFixed(0)} km`
                      : ''}
                  </p>
                  {tour.optimizationError ? (
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-amber-600">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {t(`tours.skip.${tour.optimizationError}`, {
                        defaultValue: tour.optimizationError ?? '',
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toursApi.detail(tour.id).then(setActiveTour)}
                  >
                    {t('tours.open')}
                  </Button>
                  <Button size="sm" onClick={() => void optimize(tour.id)} disabled={busy !== null}>
                    {busy === 'optimize' ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-3 w-3" />
                    )}
                    {t('tours.optimize')}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTour ? (
        <Card>
          <CardHeader>
            <CardTitle>{activeTour.name ?? t('tours.untitled')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastResult && !lastResult.optimized ? (
              <p className="flex items-start gap-1 text-sm text-amber-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {lastResult.reasonCode
                  ? t(`tours.skip.${lastResult.reasonCode}`)
                  : t('tours.notOptimized')}
              </p>
            ) : null}

            {/*
              Sonuc gorunumu ve yayin onayi TourResultPanel'de: serbest duraklu
              TourBuilder ile ayni kod. Iki kopya kacinilmaz sekilde birbirinden
              ayrisirdi — biri ETA gosterirken digeri gostermezdi.
            */}
            <TourResultPanel
              tour={activeTour}
              onTourChange={(tour) => {
                setActiveTour(tour);
                void reload();
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
