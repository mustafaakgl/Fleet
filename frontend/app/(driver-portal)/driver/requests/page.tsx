'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverFileInput } from '@/components/driver-portal/DriverFileInput';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { driverPortalApi } from '@/lib/api';
import { DRIVER_REQUEST_TYPES, driverTodayIso } from '@/lib/driver-portal-utils';
import type { DriverPortalRequest, DriverRequestType, DriverTransportFormOptions, DriverTransportRequest } from '@/lib/types';

export default function DriverRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<DriverPortalRequest[]>([]);
  const [transportRequests, setTransportRequests] = useState<DriverTransportRequest[]>([]);
  const [formOptions, setFormOptions] = useState<DriverTransportFormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<DriverRequestType>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [leaveFiles, setLeaveFiles] = useState<File[]>([]);
  const [uniformNotes, setUniformNotes] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [cargoOwner, setCargoOwner] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [routeDate, setRouteDate] = useState('');
  const [routeStartTime, setRouteStartTime] = useState('');
  const [routeEndTime, setRouteEndTime] = useState('');
  const [transportFiles, setTransportFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [leaveRows, transportRows, options] = await Promise.all([
      driverPortalApi.listRequests(),
      driverPortalApi.listTransportRequests(),
      driverPortalApi.getTransportFormOptions(),
    ]);
    setRequests(leaveRows);
    setTransportRequests(transportRows);
    setFormOptions(options);
  }

  useEffect(() => {
    reload()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function submitLeave(event: React.FormEvent) {
    event.preventDefault();
    if (!startDate || !endDate) {
      setError(t('driverPortal.requests.validationDate'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await driverPortalApi.createRequest({ type, startDate, endDate, reason });
      for (const file of leaveFiles) {
        await driverPortalApi.uploadRequestAttachment(created.id, file);
      }
      setStartDate('');
      setEndDate('');
      setReason('');
      setLeaveFiles([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.requests.loadError'));
    } finally {
      setBusy(false);
    }
  }

  async function submitUniform() {
    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.createRequest({
        type: 'uniform_delivery',
        startDate: driverTodayIso(),
        endDate: driverTodayIso(),
        reason: uniformNotes.trim() || t('driverPortal.requests.uniformDefault'),
      });
      setUniformNotes('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.requests.loadError'));
    } finally {
      setBusy(false);
    }
  }

  async function submitRoute(event: React.FormEvent) {
    event.preventDefault();
    if (!vehicleId || !companyId || !cargoName || !cargoOwner || !pickupAddress || !deliveryAddress || !routeDate || !routeStartTime || !routeEndTime) {
      setError(t('driverPortal.requests.validationRoute'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await driverPortalApi.createTransportRequest({
        vehicleId,
        companyId,
        cargoName,
        cargoOwner,
        pickupAddress,
        deliveryAddress,
        requestedDate: routeDate,
        startTime: routeStartTime,
        endTime: routeEndTime,
      });
      for (const file of transportFiles) {
        await driverPortalApi.uploadTransportAttachment(created.id, file);
      }
      setCargoName('');
      setCargoOwner('');
      setPickupAddress('');
      setDeliveryAddress('');
      setRouteDate('');
      setRouteStartTime('');
      setRouteEndTime('');
      setTransportFiles([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.requests.loadError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{t('driverPortal.requests.title')}</CardTitle>
            <p className="text-sm text-slate-600">{t('driverPortal.requests.subtitle')}</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('driverPortal.assignments.loading')}
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(e) => void submitLeave(e)}>
                <div className="space-y-2">
                  <Label>{t('driverPortal.requests.type')}</Label>
                  <Select value={type} onChange={(e) => setType(e.target.value as DriverRequestType)}>
                    {DRIVER_REQUEST_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {t(`driverPortal.requests.types.${item}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('driverPortal.requests.startDate')}</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.requests.endDate')}</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('driverPortal.requests.reason')}</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <DriverFileInput
                  label={t('driverPortal.requests.attachments')}
                  files={leaveFiles}
                  onChange={setLeaveFiles}
                />
                <Button type="submit" className="bg-[#1a4d7a] hover:bg-[#163a5c]" disabled={busy}>
                  {t('driverPortal.requests.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('driverPortal.requests.uniformTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder={t('driverPortal.requests.uniformNotes')}
              value={uniformNotes}
              onChange={(e) => setUniformNotes(e.target.value)}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => void submitUniform()}>
              {t('driverPortal.requests.uniformSubmit')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('driverPortal.requests.transportTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => void submitRoute(e)}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('driverPortal.requests.selectVehicle')}</Label>
                  <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="">{t('driverPortal.requests.selectPlaceholder')}</option>
                    {formOptions?.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.plateNumber}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('driverPortal.requests.selectCompany')}</Label>
                  <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                    <option value="">{t('driverPortal.requests.selectPlaceholder')}</option>
                    {formOptions?.companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <Input placeholder={t('driverPortal.requests.cargoName')} value={cargoName} onChange={(e) => setCargoName(e.target.value)} />
              <Input placeholder={t('driverPortal.requests.cargoOwner')} value={cargoOwner} onChange={(e) => setCargoOwner(e.target.value)} />
              <Input placeholder={t('driverPortal.requests.pickup')} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} />
              <Input placeholder={t('driverPortal.requests.delivery')} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />
                <Input type="time" value={routeStartTime} onChange={(e) => setRouteStartTime(e.target.value)} />
                <Input type="time" value={routeEndTime} onChange={(e) => setRouteEndTime(e.target.value)} />
              </div>
              <DriverFileInput label={t('driverPortal.requests.attachments')} files={transportFiles} onChange={setTransportFiles} />
              <Button type="submit" className="bg-[#1a4d7a] hover:bg-[#163a5c]" disabled={busy}>
                {t('driverPortal.requests.submitRoute')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {requests.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('driverPortal.requests.previous')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-100 text-sm">
                {requests.map((item) => (
                  <li key={item.id} className="py-2">
                    <p className="font-medium">{t(`driverPortal.requests.types.${item.type}`)}</p>
                    <p className="text-slate-600">{item.startDate} – {item.endDate}</p>
                    <p className="text-xs text-slate-500">{item.status}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {transportRequests.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('driverPortal.requests.transportHistory')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-100 text-sm">
                {transportRequests.map((item) => (
                  <li key={item.id} className="py-2">
                    <p className="font-medium">{item.cargoName}</p>
                    <p className="text-slate-600">{item.requestedDate} · {item.startTime}–{item.endTime}</p>
                    <p className="text-xs text-slate-500">{item.status}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </DriverPortalShell>
  );
}
