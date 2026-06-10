'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driversApi, finesApi, getApiErrorMessage, vehiclesApi } from '@/lib/api';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import type { Driver, FineMatchCandidate, FineMatchPreview, FineViolationCategory, Vehicle } from '@/lib/types';

const CATEGORIES: FineViolationCategory[] = ['speed', 'parking', 'red_light', 'distance', 'other'];

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewFinePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [preview, setPreview] = useState<FineMatchPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<FineMatchCandidate | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    vehicle_id: '',
    violation_at: toLocalDateTimeInputValue(new Date()),
    violation_location: '',
    violation_type: '',
    violation_category: 'speed' as FineViolationCategory,
    amount: '',
    payment_due_date: '',
    notice_date: '',
    notes: '',
    tolerance_minutes: '30',
    driver_id: '',
  });

  useEffect(() => {
    void Promise.all([
      vehiclesApi.list({ limit: 500, status: 'active' }),
      driversApi.list({ limit: 500, status: 'active' }),
    ]).then(([vehiclePage, driverPage]) => {
      setVehicles(vehiclePage.data);
      setDrivers(driverPage.data);
    });
  }, []);

  const runPreview = useCallback(async () => {
    if (!form.vehicle_id || !form.violation_at) {
      setPreview(null);
      setSelectedCandidate(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await finesApi.matchPreview({
        vehicle_id: form.vehicle_id,
        violation_at: new Date(form.violation_at).toISOString(),
        tolerance_minutes: Number(form.tolerance_minutes) || 30,
      });
      setPreview(result);
      setSelectedCandidate(result.suggested);
      if (result.suggested) {
        setForm((prev) => ({ ...prev, driver_id: result.suggested!.driver_id }));
      }
    } catch {
      setPreview(null);
      setSelectedCandidate(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [form.vehicle_id, form.violation_at, form.tolerance_minutes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runPreview();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [runPreview]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.vehicle_id || !form.violation_location.trim() || !form.violation_type.trim()) {
      setError(t('fines.requiredFields', 'Bitte Pflichtfelder ausfüllen.'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append('vehicle_id', form.vehicle_id);
      payload.append('violation_at', new Date(form.violation_at).toISOString());
      payload.append('violation_location', form.violation_location.trim());
      payload.append('violation_type', form.violation_type.trim());
      payload.append('violation_category', form.violation_category);
      if (form.amount) payload.append('amount', form.amount);
      if (form.payment_due_date) payload.append('payment_due_date', form.payment_due_date);
      if (form.notice_date) payload.append('notice_date', form.notice_date);
      if (form.notes.trim()) payload.append('notes', form.notes.trim());
      if (form.tolerance_minutes) payload.append('tolerance_minutes', form.tolerance_minutes);

      const driverId = form.driver_id || selectedCandidate?.driver_id;
      if (driverId) payload.append('driver_id', driverId);
      if (selectedCandidate?.work_session_id) {
        payload.append('matched_work_session_id', selectedCandidate.work_session_id);
      }
      if (selectedCandidate?.assignment_id) {
        payload.append('matched_assignment_id', selectedCandidate.assignment_id);
      }
      if (documentFile) payload.append('document', documentFile);

      const created = await finesApi.create(payload);
      router.push(`/fines/${created.id}`);
    } catch (e) {
      setError(getApiErrorMessage(e, t('fines.createError', 'Bußgeld konnte nicht gespeichert werden.')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/fines">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <Scale className="h-7 w-7 text-blue-700" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fines.createTitle', 'Bußgeld erfassen')}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>{t('fines.form.details', 'Angaben')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vehicle_id">{t('fines.form.vehicle', 'Fahrzeug')}</Label>
              <select
                id="vehicle_id"
                required
                value={form.vehicle_id}
                onChange={(e) => setForm((prev) => ({ ...prev, vehicle_id: e.target.value }))}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              >
                <option value="">{t('fines.form.selectVehicle', 'Fahrzeug wählen')}</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate_number}
                    {vehicle.internal_code ? ` (${vehicle.internal_code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="violation_at">{t('fines.form.violationAt', 'Zeitpunkt')}</Label>
              <Input
                id="violation_at"
                type="datetime-local"
                required
                value={form.violation_at}
                onChange={(e) => setForm((prev) => ({ ...prev, violation_at: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tolerance_minutes">{t('fines.form.tolerance', 'Toleranz (Min.)')}</Label>
              <Input
                id="tolerance_minutes"
                type="number"
                min={0}
                value={form.tolerance_minutes}
                onChange={(e) => setForm((prev) => ({ ...prev, tolerance_minutes: e.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="violation_location">{t('fines.form.location', 'Ort')}</Label>
              <Input
                id="violation_location"
                required
                value={form.violation_location}
                onChange={(e) => setForm((prev) => ({ ...prev, violation_location: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="violation_type">{t('fines.form.violationType', 'Verstoß')}</Label>
              <Input
                id="violation_type"
                required
                value={form.violation_type}
                onChange={(e) => setForm((prev) => ({ ...prev, violation_type: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="violation_category">{t('fines.form.category', 'Kategorie')}</Label>
              <select
                id="violation_category"
                value={form.violation_category}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    violation_category: e.target.value as FineViolationCategory,
                  }))
                }
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`fines.category.${category}`, category)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">{t('fines.form.amount', 'Betrag (€)')}</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_due_date">{t('fines.form.paymentDue', 'Zahlungsfrist')}</Label>
              <Input
                id="payment_due_date"
                type="date"
                value={form.payment_due_date}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_due_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notice_date">{t('fines.form.noticeDate', 'Bescheiddatum')}</Label>
              <Input
                id="notice_date"
                type="date"
                value={form.notice_date}
                onChange={(e) => setForm((prev) => ({ ...prev, notice_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="driver_id">{t('fines.form.driverOverride', 'Fahrer (manuell)')}</Label>
              <select
                id="driver_id"
                value={form.driver_id}
                onChange={(e) => setForm((prev) => ({ ...prev, driver_id: e.target.value }))}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              >
                <option value="">{t('fines.form.autoMatch', 'Automatisch zuordnen')}</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.first_name} {driver.last_name} ({driver.employee_number})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">{t('fines.form.notes', 'Notizen')}</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="document">{t('fines.form.document', 'Bescheid (PDF/Bild)')}</Label>
              <Input
                id="document"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('fines.matchPreview', 'Fahrer-Zuordnung')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('fines.matchLoading', 'Zuordnung wird geprüft…')}
                </div>
              ) : !preview ? (
                <p className="text-slate-500">{t('fines.matchHint', 'Fahrzeug und Zeitpunkt wählen.')}</p>
              ) : preview.candidates.length === 0 ? (
                <p className="text-amber-700">{t('fines.matchNone', 'Kein passender Fahrer gefunden.')}</p>
              ) : (
                <>
                  <p className="text-slate-600">
                    {t('fines.matchType', 'Typ')}:{' '}
                    <span className="font-medium">{t(`fines.match.${preview.match_type}`, preview.match_type)}</span>
                  </p>
                  {preview.candidates.map((candidate) => (
                    <label
                      key={`${candidate.driver_id}-${candidate.work_session_id}`}
                      className={`block cursor-pointer rounded-md border p-3 ${
                        selectedCandidate?.driver_id === candidate.driver_id &&
                        selectedCandidate.work_session_id === candidate.work_session_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        checked={
                          selectedCandidate?.driver_id === candidate.driver_id &&
                          selectedCandidate.work_session_id === candidate.work_session_id
                        }
                        onChange={() => {
                          setSelectedCandidate(candidate);
                          setForm((prev) => ({ ...prev, driver_id: candidate.driver_id }));
                        }}
                      />
                      <div className="font-medium">{candidate.driver_name}</div>
                      <div className="text-slate-600">{candidate.employee_number}</div>
                      {candidate.company_name ? (
                        <div className="text-slate-500">{candidate.company_name}</div>
                      ) : null}
                      <div className="text-xs text-slate-500">
                        Score {candidate.match_score}
                      </div>
                    </label>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('fines.saving', 'Speichern…')}
              </>
            ) : (
              t('fines.save', 'Bußgeld speichern')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
