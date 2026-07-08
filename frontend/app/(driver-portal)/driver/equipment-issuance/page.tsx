'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { DocumentFileLink } from '@/components/documents/DocumentFileLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import type { DriverEquipmentIssuance } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export default function DriverEquipmentIssuancePage() {
  const params = useSearchParams();
  const issuanceId = params.get('id');
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [issuances, setIssuances] = useState<DriverEquipmentIssuance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formPreviewUrl, setFormPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    driverPortalApi
      .listEquipmentIssuances()
      .then((rows) => {
        setIssuances(rows);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('driverPortal.equipmentIssuance.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  const selected = (issuanceId ? issuances.find((row) => row.id === issuanceId) : undefined)
    ?? issuances.find((row) => row.status === 'pending_signature')
    ?? issuances[0];

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!selected) {
      setFormPreviewUrl(null);
      return undefined;
    }

    driverPortalApi
      .getEquipmentIssuanceFormBlob(selected.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setFormPreviewUrl(objectUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('driverPortal.equipmentIssuance.formLoadError')));

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selected?.id, t]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function ensureCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    return { canvas, ctx };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = ensureCanvas();
    if (!active) return;
    drawingRef.current = true;
    const point = pointFromEvent(event);
    active.ctx.beginPath();
    active.ctx.moveTo(point.x, point.y);
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const active = ensureCanvas();
    if (!active) return;
    const point = pointFromEvent(event);
    active.ctx.lineTo(point.x, point.y);
    active.ctx.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const active = ensureCanvas();
    if (!active) return;
    active.ctx.clearRect(0, 0, active.canvas.width, active.canvas.height);
  }

  async function signSelected() {
    if (!selected || selected.status !== 'pending_signature') {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length < 200) {
      setError(t('driverPortal.equipmentIssuance.signatureRequired'));
      return;
    }

    setSaving(true);
    try {
      const updated = await driverPortalApi.signEquipmentIssuance(selected.id, dataUrl);
      setIssuances((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      clearSignature();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.equipmentIssuance.signError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.equipmentIssuance.title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.equipmentIssuance.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : !selected ? (
            <p className="text-sm text-slate-500">{t('driverPortal.equipmentIssuance.empty')}</p>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">
                  {selected.title}
                </p>
                <p className="text-slate-700">
                  {selected.driver ? `${selected.driver.firstName} ${selected.driver.lastName}` : t('driverPortal.driver')}
                </p>
                <p className="text-slate-600">{formatDate(selected.issuedAt)}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                  {selected.status.replace(/_/g, ' ')}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">{t('driverPortal.equipmentIssuance.formTitle')}</p>
                {formPreviewUrl ? (
                  <iframe
                    title={selected.title}
                    src={formPreviewUrl}
                    className="h-[420px] w-full rounded-md border border-slate-200"
                  />
                ) : (
                  <p className="text-sm text-slate-500">{t('driverPortal.equipmentIssuance.formLoading')}</p>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">{t('driverPortal.equipmentIssuance.items')}</p>
                {selected.items.map((item, index) => (
                  <div key={`${selected.id}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>{item.name}</span>
                      <span className="font-semibold">x{item.quantity}</span>
                    </div>
                    {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                  </div>
                ))}
              </div>

              {selected.status === 'pending_signature' ? (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{t('driverPortal.equipmentIssuance.signature')}</p>
                    <Button type="button" variant="ghost" size="sm" onClick={clearSignature}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {t('driverPortal.equipmentIssuance.clear')}
                    </Button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={220}
                    className="h-44 w-full touch-none rounded-md border border-slate-300 bg-white"
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerLeave={stopDrawing}
                  />
                  <Button type="button" className="w-full" disabled={saving} onClick={() => void signSelected()}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('driverPortal.equipmentIssuance.sign')}
                  </Button>
                </div>
              ) : null}

              {selected.finalDocument ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-slate-900">{t('driverPortal.equipmentIssuance.pdfReady')}</p>
                  <DocumentFileLink
                    variant="link"
                    document={{
                      id: selected.finalDocument.id,
                      fileName: selected.finalDocument.fileName,
                      fileUrl: selected.finalDocument.fileUrl ?? undefined,
                      download_url: selected.finalDocument.download_url,
                    }}
                  />
                </div>
              ) : null}
            </>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}