'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { DriverHandoverPhotoPreview } from '@/components/driver-portal/DriverHandoverPhotoPreview';
import { HandoverCameraCapture } from '@/components/driver-portal/HandoverCameraCapture';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import { driverTodayIso, HANDOVER_PHOTO_SLOTS } from '@/lib/driver-portal-utils';
import type { DriverHandover, DriverHandoverPhotoSlot } from '@/lib/types';
import { cn } from '@/lib/utils';

function slotLabelKey(slot: DriverHandoverPhotoSlot): string {
  return `driverPortal.handover.slot_${slot}`;
}

export default function DriverHandoverPage() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const vehicleId = params.get('vehicleId') ?? '';
  const assignmentId = params.get('assignmentId') ?? '';
  const [handover, setHandover] = useState<DriverHandover | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<DriverHandoverPhotoSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstAidKit, setFirstAidKit] = useState(false);
  const [fireExtinguisher, setFireExtinguisher] = useState(false);
  const [straps, setStraps] = useState(false);
  const [safetyVest, setSafetyVest] = useState(false);
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [equipmentBusy, setEquipmentBusy] = useState(false);

  const loadHandover = useCallback(async () => {
    if (!vehicleId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await driverPortalApi.listHandovers({ date: driverTodayIso() });
      const existing = list.find(
        (row) => row.vehicleId === vehicleId && row.assignmentId === (assignmentId || null),
      );
      if (existing) {
        setHandover(await driverPortalApi.getHandover(existing.id));
      } else {
        try {
          setHandover(
            await driverPortalApi.createHandover({
              vehicleId,
              assignmentId: assignmentId || undefined,
              handoverType: 'pickup',
            }),
          );
        } catch {
          setHandover(
            await driverPortalApi.createHandover({
              vehicleId,
              handoverType: 'pickup',
            }),
          );
        }
      }
      setError(null);
    } catch (err) {
      setHandover(null);
      setError(err instanceof Error ? err.message : t('driverPortal.handover.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, t, vehicleId]);

  useEffect(() => {
    void loadHandover();
  }, [loadHandover]);

  const requiredSlots = useMemo(() => {
    if (handover?.requiredPhotoSlots?.length) return handover.requiredPhotoSlots;
    return HANDOVER_PHOTO_SLOTS;
  }, [handover?.requiredPhotoSlots]);

  async function uploadSlot(
    slot: DriverHandoverPhotoSlot,
    file: File,
    metadata: { takenAt: string; gpsLat?: number; gpsLng?: number; deviceInfo: string },
  ) {
    if (!handover?.id) return;
    setUploadingSlot(slot);
    try {
      const result = await driverPortalApi.uploadHandoverPhoto(handover.id, slot, file, metadata);
      setHandover(result.handover);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.handover.uploadFailed'));
    } finally {
      setUploadingSlot(null);
    }
  }

  async function submitEquipment() {
    if (!handover?.id) return;
    setEquipmentBusy(true);
    try {
      const updated = await driverPortalApi.submitHandoverEquipment(handover.id, {
        firstAidKit,
        fireExtinguisher,
        straps,
        safetyVest,
        notes: equipmentNotes.trim() || undefined,
      });
      setHandover(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.handover.equipmentFailed'));
    } finally {
      setEquipmentBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.handover.title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.handover.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('driverPortal.assignments.loading')}
            </div>
          ) : !vehicleId ? (
            <p className="text-sm text-amber-800">{t('driverPortal.handover.noVehicle')}</p>
          ) : handover?.photoRequired === false ? (
            <p className="text-sm text-slate-600">{t('driverPortal.handover.sameVehicle')}</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">{t('driverPortal.handover.vehicleChanged')}</p>
              <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-[#1a4d7a]">
                {t('driverPortal.handover.cameraOnlyHint')}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {requiredSlots.map((slot) => {
                  const photo = handover?.photos?.[slot];
                  const uploaded = Boolean(photo);
                  return (
                    <div
                      key={slot}
                      className={cn(
                        'flex flex-col gap-2 rounded-lg border p-3 text-sm',
                        uploaded ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white',
                      )}
                    >
                      <span className="flex items-center justify-between font-medium">
                        {t(slotLabelKey(slot))}
                        {uploaded ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                      </span>
                      {photo?.id ? (
                        <DriverHandoverPhotoPreview
                          documentId={photo.id}
                          alt={t(slotLabelKey(slot))}
                        />
                      ) : null}
                      <HandoverCameraCapture
                        slotLabel={uploaded ? t('driverPortal.handover.replacePhoto') : t('driverPortal.handover.openCamera')}
                        disabled={uploadingSlot === slot}
                        onError={(message) => setError(message)}
                        onCaptured={(file, metadata) => void uploadSlot(slot, file, metadata)}
                      />
                      {uploadingSlot === slot ? (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t('driverPortal.handover.uploading')}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{t('driverPortal.handover.equipmentTitle')}</p>
                <label className="flex items-center justify-between gap-3">
                  <span>{t('driverPortal.handover.firstAid')}</span>
                  <input type="checkbox" checked={firstAidKit} onChange={(e) => setFirstAidKit(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>{t('driverPortal.handover.fireExtinguisher')}</span>
                  <input
                    type="checkbox"
                    checked={fireExtinguisher}
                    onChange={(e) => setFireExtinguisher(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>{t('driverPortal.handover.straps')}</span>
                  <input type="checkbox" checked={straps} onChange={(e) => setStraps(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>{t('driverPortal.handover.safetyVest')}</span>
                  <input type="checkbox" checked={safetyVest} onChange={(e) => setSafetyVest(e.target.checked)} />
                </label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder={t('driverPortal.handover.equipmentNotes')}
                  value={equipmentNotes}
                  onChange={(e) => setEquipmentNotes(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={equipmentBusy}
                  onClick={() => void submitEquipment()}
                >
                  {equipmentBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('driverPortal.handover.saveEquipment')}
                </Button>
              </div>
            </>
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
