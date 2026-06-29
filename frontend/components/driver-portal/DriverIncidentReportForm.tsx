'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverFileInput } from '@/components/driver-portal/DriverFileInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driverPortalApi } from '@/lib/api';
import type { DriverIncident } from '@/lib/types';

interface DriverIncidentReportFormProps {
  type: 'vehicle_accident' | 'cargo_damage';
  assignmentId?: string;
  vehicleId?: string;
}

export function DriverIncidentReportForm({
  type,
  assignmentId: initialAssignmentId,
  vehicleId: initialVehicleId,
}: DriverIncidentReportFormProps) {
  const { t } = useTranslation();
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? '');
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId ?? '');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [cargoOwner, setCargoOwner] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [history, setHistory] = useState<DriverIncident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    driverPortalApi.listAccidents({ type }).then(setHistory).catch(() => setHistory([]));
  }, [type]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!vehicleId.trim()) {
      setError(t('driverPortal.incident.validationVehicle'));
      return;
    }
    if (!description.trim()) {
      setError(t('driverPortal.incident.validationDescription'));
      return;
    }
    if (type === 'cargo_damage' && !cargoName.trim()) {
      setError(t('driverPortal.incident.validationCargo'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await driverPortalApi.createAccident({
        type,
        vehicleId: vehicleId.trim(),
        assignmentId: assignmentId.trim() || undefined,
        incidentDateTime: new Date().toISOString(),
        description: description.trim(),
        location: location.trim() || undefined,
        cargoName: cargoName.trim() || undefined,
        cargoOwner: cargoOwner.trim() || undefined,
      });
      for (const file of attachments) {
        await driverPortalApi.uploadAccidentAttachment(
          created.id,
          file,
          type === 'vehicle_accident' ? 'Scene Photo' : 'Damage Photo',
        );
      }
      setDescription('');
      setLocation('');
      setCargoName('');
      setCargoOwner('');
      setAttachments([]);
      setSuccess(true);
      const rows = await driverPortalApi.listAccidents({ type });
      setHistory(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.incident.submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-2">
          <Label>{t('driverPortal.incident.vehicleId')}</Label>
          <Input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('driverPortal.incident.assignmentId')}</Label>
          <Input value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} />
        </div>
        {type === 'cargo_damage' ? (
          <>
            <div className="space-y-2">
              <Label>{t('driverPortal.incident.cargoName')}</Label>
              <Input value={cargoName} onChange={(e) => setCargoName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.incident.cargoOwner')}</Label>
              <Input value={cargoOwner} onChange={(e) => setCargoOwner(e.target.value)} />
            </div>
          </>
        ) : null}
        <div className="space-y-2">
          <Label>{t('driverPortal.incident.location')}</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('driverPortal.incident.description')}</Label>
          <textarea
            className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <DriverFileInput
          label={t('driverPortal.incident.addPhoto')}
          hint={t('driverPortal.incident.photoHint')}
          files={attachments}
          onChange={setAttachments}
          maxFiles={8}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{t('driverPortal.incident.success')}</p> : null}
        <Button type="submit" className="w-full bg-brand-primary hover:bg-brand-primary" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('driverPortal.incident.submit')}
        </Button>
      </form>

      {history.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">{t('driverPortal.incident.previous')}</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {history.slice(0, 5).map((item) => (
              <li key={item.id} className="px-3 py-2 text-sm text-slate-700">
                <p className="font-medium">{new Date(item.incidentDateTime).toLocaleString()}</p>
                <p className="line-clamp-2 text-slate-600">{item.description}</p>
                <p className="text-xs text-slate-500">{item.status}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
