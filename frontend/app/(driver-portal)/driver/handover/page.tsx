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
  const [damageDetected, setDamageDetected] = useState(false);
  const [damageNotes, setDamageNotes] = useState('');
  const [equipmentBusy, setEquipmentBusy] = useState(false);
  const [inventoryQuantities, setInventoryQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!handover) return;
    setDamageDetected(handover.damageDetected ?? false);
    setDamageNotes(handover.damageNotes ?? '');
    if (handover.equipmentChecklist) {
      setFirstAidKit(handover.equipmentChecklist.firstAidKit);
      setFireExtinguisher(handover.equipmentChecklist.fireExtinguisher);
      setStraps(handover.equipmentChecklist.straps);
      setSafetyVest(handover.equipmentChecklist.safetyVest);
      setEquipmentNotes(handover.equipmentChecklist.notes);
      const nextInventory: Record<string, string> = {};
      for (const row of handover.equipmentChecklist.inventoryChecks ?? []) {
        nextInventory[row.equipmentId] = String(row.quantityPresent);
      }
      for (const item of handover.equipmentChecklist.vehicleEquipment ?? []) {
        if (nextInventory[item.id] === undefined) {
          nextInventory[item.id] = String(item.expectedQuantity);
        }
      }
      setInventoryQuantities(nextInventory);
    }
  }, [handover?.id]);

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
      const vehicleEquipment = handover.equipmentChecklist?.vehicleEquipment ?? [];
      const inventoryChecks = vehicleEquipment.map((item) => ({
        equipmentId: item.id,
        quantityPresent: Number.parseInt(inventoryQuantities[item.id] ?? '0', 10) || 0,
      }));
      const updated = await driverPortalApi.submitHandoverEquipment(handover.id, {
        firstAidKit,
        fireExtinguisher,
        straps,
        safetyVest,
        notes: equipmentNotes.trim() || undefined,
        damageDetected,
        damageNotes: damageDetected ? damageNotes.trim() || undefined : undefined,
        inventoryChecks: inventoryChecks.length > 0 ? inventoryChecks : undefined,
      });
      setHandover(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.handover.equipmentFailed'));
    } finally {
      setEquipmentBusy(false);
    }
  }

  const vehicleEquipment = handover?.equipmentChecklist?.vehicleEquipment ?? [];

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

              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-sm font-semibold text-slate-900">{t('driverPortal.handover.damageTitle')}</p>
                <p className="text-xs text-slate-600">{t('driverPortal.handover.damageHint')}</p>
                <label className="flex items-center justify-between gap-3">
                  <span>{t('driverPortal.handover.damageDetected')}</span>
                  <input
                    type="checkbox"
                    checked={damageDetected}
                    onChange={(e) => setDamageDetected(e.target.checked)}
                  />
                </label>
                {damageDetected ? (
                  <textarea
                    className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={t('driverPortal.handover.damageNotes')}
                    value={damageNotes}
                    onChange={(e) => setDamageNotes(e.target.value)}
                  />
                ) : null}
              </div>

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

                {vehicleEquipment.length > 0 ? (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {t('driverPortal.handover.inventoryTitle')}
                    </p>
                    <p className="text-xs text-slate-600">{t('driverPortal.handover.inventoryHint')}</p>
                    {vehicleEquipment.map((item) => {
                      const entered = Number.parseInt(inventoryQuantities[item.id] ?? '', 10);
                      const mismatch =
                        Number.isFinite(entered) && entered !== item.expectedQuantity;
                      return (
                        <div key={item.id} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{item.name}</span>
                            <span className="text-xs text-slate-500">
                              {t('driverPortal.handover.inventoryExpected', {
                                count: item.expectedQuantity,
                              })}
                            </span>
                          </div>
                          {item.photoDocumentId ? (
                            <DriverHandoverPhotoPreview
                              documentId={item.photoDocumentId}
                              alt={item.name}
                            />
                          ) : null}
                          <label className="flex items-center justify-between gap-3 text-sm">
                            <span>{t('driverPortal.handover.inventoryPresent')}</span>
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={inventoryQuantities[item.id] ?? ''}
                              onChange={(e) =>
                                setInventoryQuantities((current) => ({
                                  ...current,
                                  [item.id]: e.target.value,
                                }))
                              }
                            />
                          </label>
                          {mismatch ? (
                            <p className="text-xs text-amber-700">
                              {t('driverPortal.handover.inventoryMismatch')}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

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
