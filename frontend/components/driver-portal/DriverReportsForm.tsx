'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverFileInput } from '@/components/driver-portal/DriverFileInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { driverPortalApi } from '@/lib/api';
import type { DriverTransportFormOptions } from '@/lib/types';

function formatVehicleLabel(vehicle: {
  plateNumber: string;
  brand?: string;
  model?: string;
}) {
  if (vehicle.brand && vehicle.model) {
    return `${vehicle.plateNumber} · ${vehicle.brand} ${vehicle.model}`;
  }
  return vehicle.plateNumber;
}

function assignmentForVehicle(
  vehicleId: string,
  assignments: DriverTransportFormOptions['assignments'],
) {
  return assignments.find((item) => item.vehicleId === vehicleId)?.id;
}

async function uploadFiles(
  accidentId: string,
  files: File[],
  documentType: string,
) {
  for (const file of files) {
    await driverPortalApi.uploadAccidentAttachment(accidentId, file, documentType);
  }
}

export function DriverReportsForm() {
  const { t } = useTranslation();
  const [formOptions, setFormOptions] = useState<DriverTransportFormOptions | null>(null);
  const [accidentVehicleId, setAccidentVehicleId] = useState('');
  const [cargoVehicleId, setCargoVehicleId] = useState('');
  const [location, setLocation] = useState('');
  const [accidentDescription, setAccidentDescription] = useState('');
  const [accidentPhotos, setAccidentPhotos] = useState<File[]>([]);
  const [policeDocuments, setPoliceDocuments] = useState<File[]>([]);
  const [cargoOwner, setCargoOwner] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [cargoQuantity, setCargoQuantity] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [cargoPhotos, setCargoPhotos] = useState<File[]>([]);
  const [cargoDocuments, setCargoDocuments] = useState<File[]>([]);
  const [accidentBusy, setAccidentBusy] = useState(false);
  const [cargoBusy, setCargoBusy] = useState(false);
  const [accidentError, setAccidentError] = useState<string | null>(null);
  const [cargoError, setCargoError] = useState<string | null>(null);
  const [accidentSuccess, setAccidentSuccess] = useState(false);
  const [cargoSuccess, setCargoSuccess] = useState(false);

  useEffect(() => {
    driverPortalApi
      .getTransportFormOptions()
      .then((options) => {
        setFormOptions(options);
        const defaultVehicleId = options.vehicles[0]?.id ?? '';
        setAccidentVehicleId((current) => current || defaultVehicleId);
        setCargoVehicleId((current) => current || defaultVehicleId);
      })
      .catch(() => undefined);
  }, []);

  const accidentAssignmentId = useMemo(
    () => (accidentVehicleId && formOptions ? assignmentForVehicle(accidentVehicleId, formOptions.assignments) : undefined),
    [accidentVehicleId, formOptions],
  );

  const cargoAssignmentId = useMemo(
    () => (cargoVehicleId && formOptions ? assignmentForVehicle(cargoVehicleId, formOptions.assignments) : undefined),
    [cargoVehicleId, formOptions],
  );

  async function submitAccident(event: React.FormEvent) {
    event.preventDefault();
    if (!accidentVehicleId) {
      setAccidentError(t('driverPortal.reports.validationVehicle'));
      return;
    }
    if (!accidentDescription.trim()) {
      setAccidentError(t('driverPortal.reports.validationDescription'));
      return;
    }

    setAccidentBusy(true);
    setAccidentError(null);
    setAccidentSuccess(false);
    try {
      const created = await driverPortalApi.createAccident({
        type: 'vehicle_accident',
        vehicleId: accidentVehicleId,
        assignmentId: accidentAssignmentId,
        incidentDateTime: new Date().toISOString(),
        description: accidentDescription.trim(),
        location: location.trim() || undefined,
      });
      await uploadFiles(created.id, accidentPhotos, 'Scene Photo');
      await uploadFiles(created.id, policeDocuments, 'Police Report');
      setAccidentDescription('');
      setLocation('');
      setAccidentPhotos([]);
      setPoliceDocuments([]);
      setAccidentSuccess(true);
    } catch (err) {
      setAccidentError(err instanceof Error ? err.message : t('driverPortal.reports.submitFailed'));
    } finally {
      setAccidentBusy(false);
    }
  }

  async function submitCargo(event: React.FormEvent) {
    event.preventDefault();
    if (!cargoVehicleId) {
      setCargoError(t('driverPortal.reports.validationVehicle'));
      return;
    }
    if (!cargoOwner.trim() || !cargoType.trim() || !cargoQuantity.trim()) {
      setCargoError(t('driverPortal.reports.validationCargoFields'));
      return;
    }
    if (!cargoDescription.trim()) {
      setCargoError(t('driverPortal.reports.validationDescription'));
      return;
    }

    setCargoBusy(true);
    setCargoError(null);
    setCargoSuccess(false);
    try {
      const created = await driverPortalApi.createAccident({
        type: 'cargo_damage',
        vehicleId: cargoVehicleId,
        assignmentId: cargoAssignmentId,
        incidentDateTime: new Date().toISOString(),
        description: cargoDescription.trim(),
        cargoOwner: cargoOwner.trim(),
        cargoName: cargoType.trim(),
        cargoQuantity: cargoQuantity.trim(),
      });
      await uploadFiles(created.id, cargoPhotos, 'Damage Photo');
      await uploadFiles(created.id, cargoDocuments, 'Cargo Owner Document');
      setCargoOwner('');
      setCargoType('');
      setCargoQuantity('');
      setCargoDescription('');
      setCargoPhotos([]);
      setCargoDocuments([]);
      setCargoSuccess(true);
    } catch (err) {
      setCargoError(err instanceof Error ? err.message : t('driverPortal.reports.submitFailed'));
    } finally {
      setCargoBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.reports.accidentTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.reports.accidentSubtitle')}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void submitAccident(e)}>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.vehicle')}</Label>
              <Select value={accidentVehicleId} onChange={(e) => setAccidentVehicleId(e.target.value)}>
                <option value="">{t('driverPortal.requests.selectPlaceholder')}</option>
                {formOptions?.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {formatVehicleLabel(vehicle)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.location')}</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.description')}</Label>
              <textarea
                className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={accidentDescription}
                onChange={(e) => setAccidentDescription(e.target.value)}
              />
            </div>
            <DriverFileInput
              label={t('driverPortal.reports.accidentPhotos')}
              hint={t('driverPortal.reports.accidentPhotosHint')}
              files={accidentPhotos}
              onChange={setAccidentPhotos}
              maxFiles={6}
              accept="image/*"
            />
            <DriverFileInput
              label={t('driverPortal.reports.policeDocuments')}
              hint={t('driverPortal.reports.policeDocumentsHint')}
              files={policeDocuments}
              onChange={setPoliceDocuments}
              maxFiles={4}
              accept="image/*,.pdf"
            />
            {accidentError ? <p className="text-sm text-red-600">{accidentError}</p> : null}
            {accidentSuccess ? <p className="text-sm text-emerald-700">{t('driverPortal.reports.accidentSuccess')}</p> : null}
            <Button type="submit" className="w-full bg-brand-primary hover:bg-brand-primary" disabled={accidentBusy}>
              {accidentBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('driverPortal.reports.submitAccident')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.reports.cargoTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.reports.cargoSubtitle')}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void submitCargo(e)}>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.vehicle')}</Label>
              <Select value={cargoVehicleId} onChange={(e) => setCargoVehicleId(e.target.value)}>
                <option value="">{t('driverPortal.requests.selectPlaceholder')}</option>
                {formOptions?.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {formatVehicleLabel(vehicle)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.cargoOwner')}</Label>
              <Input value={cargoOwner} onChange={(e) => setCargoOwner(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.cargoType')}</Label>
              <Input value={cargoType} onChange={(e) => setCargoType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.cargoQuantity')}</Label>
              <Input value={cargoQuantity} onChange={(e) => setCargoQuantity(e.target.value)} placeholder="z. B. 12 Paletten" />
            </div>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.description')}</Label>
              <textarea
                className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={cargoDescription}
                onChange={(e) => setCargoDescription(e.target.value)}
              />
            </div>
            <DriverFileInput
              label={t('driverPortal.reports.cargoPhotos')}
              hint={t('driverPortal.reports.cargoPhotosHint')}
              files={cargoPhotos}
              onChange={setCargoPhotos}
              maxFiles={6}
              accept="image/*"
            />
            <DriverFileInput
              label={t('driverPortal.reports.cargoDocuments')}
              hint={t('driverPortal.reports.cargoDocumentsHint')}
              files={cargoDocuments}
              onChange={setCargoDocuments}
              maxFiles={4}
              accept="image/*,.pdf"
            />
            {cargoError ? <p className="text-sm text-red-600">{cargoError}</p> : null}
            {cargoSuccess ? <p className="text-sm text-emerald-700">{t('driverPortal.reports.cargoSuccess')}</p> : null}
            <Button type="submit" className="w-full bg-brand-primary hover:bg-brand-primary" disabled={cargoBusy}>
              {cargoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('driverPortal.reports.submitCargo')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
