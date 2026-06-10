'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Loader2, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StructuredAddressFields } from '@/components/shared/StructuredAddressFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LicenseComplianceWarningDialog } from '@/components/license-checks/LicenseComplianceWarningDialog';
import { driversApi, vehiclesApi, companiesApi } from '@/lib/api';
import {
  createAssignmentWithLicenseAck,
  parseLicenseComplianceError,
  shouldWarnLicenseCompliance,
} from '@/lib/license-compliance-assignment';
import { buildAssignmentRouteName, formatStructuredAddress } from '@/lib/address-format';
import type { Driver, Vehicle, Company } from '@/lib/types';

const addressPart = z.string().min(1, 'assignmentForm.required');

const schema = z.object({
  driver_id: z.string().min(1, 'assignmentForm.driverRequired'),
  vehicle_id: z.string().optional(),
  company_id: z.string().min(1, 'assignmentForm.companyRequired'),
  cargo_name: z.string().min(1, 'assignmentForm.required'),
  cargo_owner: z.string().min(1, 'assignmentForm.required'),
  pickup_street: addressPart,
  pickup_zip_code: addressPart,
  pickup_city: addressPart,
  pickup_country: z.string().min(1, 'assignmentForm.required'),
  delivery_street: addressPart,
  delivery_zip_code: addressPart,
  delivery_city: addressPart,
  delivery_country: z.string().min(1, 'assignmentForm.required'),
  work_date: z.string().min(1, 'assignmentForm.required'),
  start_time: z.string().min(1, 'assignmentForm.required'),
  end_time: z.string().min(1, 'assignmentForm.required'),
  expected_daily_revenue: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
    z.number().min(0, 'assignmentForm.revenueMin').optional(),
  ),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const selectClass =
  'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function NewAssignmentPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [licenseWarningOpen, setLicenseWarningOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<FormData | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);

  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
    defaultValues: {
      pickup_country: 'Deutschland',
      delivery_country: 'Deutschland',
    },
  });

  const routePreview = useMemo(
    () => buildAssignmentRouteName(pickupAddress, deliveryAddress),
    [deliveryAddress, pickupAddress],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      driversApi.list({ status: 'active', limit: 200 }),
      vehiclesApi.list({ limit: 200 }),
      companiesApi.list({ limit: 200 }),
    ])
      .then(([driverRes, vehicleRes, companyRes]) => {
        if (!active) return;
        setDrivers(driverRes.data);
        setVehicles(vehicleRes.data);
        setCompanies(companyRes.data);
      })
      .catch(() => {
        if (active) setRefsError(t('assignmentForm.refsError'));
      })
      .finally(() => {
        if (active) setRefsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  function syncPickupAddress(parts: { street: string; zipCode: string; city: string; country: string }) {
    setValue('pickup_street', parts.street, { shouldValidate: true });
    setValue('pickup_zip_code', parts.zipCode, { shouldValidate: true });
    setValue('pickup_city', parts.city, { shouldValidate: true });
    setValue('pickup_country', parts.country, { shouldValidate: true });
    setPickupAddress(formatStructuredAddress(parts));
  }

  function syncDeliveryAddress(parts: { street: string; zipCode: string; city: string; country: string }) {
    setValue('delivery_street', parts.street, { shouldValidate: true });
    setValue('delivery_zip_code', parts.zipCode, { shouldValidate: true });
    setValue('delivery_city', parts.city, { shouldValidate: true });
    setValue('delivery_country', parts.country, { shouldValidate: true });
    setDeliveryAddress(formatStructuredAddress(parts));
  }

  async function createAssignment(data: FormData, acknowledgeLicenseWarning = false) {
    setServerError(null);
    const company = companies.find((item) => item.id === data.company_id);
    const pickup = formatStructuredAddress({
      street: data.pickup_street,
      zipCode: data.pickup_zip_code,
      city: data.pickup_city,
      country: data.pickup_country,
    });
    const delivery = formatStructuredAddress({
      street: data.delivery_street,
      zipCode: data.delivery_zip_code,
      city: data.delivery_city,
      country: data.delivery_country,
    });

    try {
      await createAssignmentWithLicenseAck(
        {
          driver_id: data.driver_id,
          vehicle_id: data.vehicle_id || undefined,
          company_id: data.company_id,
          company_name: company?.name,
          cargo_name: data.cargo_name,
          cargo_owner: data.cargo_owner,
          pickup_address: pickup,
          delivery_address: delivery,
          work_date: data.work_date,
          start_time: data.start_time,
          end_time: data.end_time,
          route_name: buildAssignmentRouteName(pickup, delivery) || undefined,
          expected_daily_revenue: data.expected_daily_revenue,
          notes: data.notes || undefined,
        },
        acknowledgeLicenseWarning,
      );
      router.push('/assignments');
    } catch (err: unknown) {
      if (parseLicenseComplianceError(err)) {
        setPendingSubmit(data);
        setLicenseWarningOpen(true);
        return;
      }
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const text = Array.isArray(message) ? message.join(' ') : message;
      setServerError(
        text === 'CONFLICT'
          ? t('assignmentForm.conflict')
          : text || t('assignmentForm.createError'),
      );
    }
  }

  async function onSubmit(data: FormData) {
    if (await shouldWarnLicenseCompliance(data.driver_id)) {
      setPendingSubmit(data);
      setLicenseWarningOpen(true);
      return;
    }
    await createAssignment(data, false);
  }

  const pickupError =
    errors.pickup_street?.message ||
    errors.pickup_zip_code?.message ||
    errors.pickup_city?.message ||
    errors.pickup_country?.message;
  const deliveryError =
    errors.delivery_street?.message ||
    errors.delivery_zip_code?.message ||
    errors.delivery_city?.message ||
    errors.delivery_country?.message;

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/assignments">
          <ChevronLeft className="w-4 h-4 mr-1" />
          {t('assignmentForm.back')}
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <CalendarDays className="w-6 h-6 text-green-600" />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('assignmentForm.title')}</h1>
      </div>

      {refsError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{refsError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        <input type="hidden" {...register('pickup_street')} />
        <input type="hidden" {...register('pickup_zip_code')} />
        <input type="hidden" {...register('pickup_city')} />
        <input type="hidden" {...register('pickup_country')} />
        <input type="hidden" {...register('delivery_street')} />
        <input type="hidden" {...register('delivery_zip_code')} />
        <input type="hidden" {...register('delivery_city')} />
        <input type="hidden" {...register('delivery_country')} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('assignmentForm.details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t('assignmentForm.driver')} *`} error={t(errors.driver_id?.message ?? '')}>
                <select {...register('driver_id')} className={selectClass} disabled={refsLoading}>
                  <option value="">{refsLoading ? t('assignmentForm.loading') : t('assignmentForm.selectDriver')}</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.first_name} {driver.last_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('assignmentForm.vehicle')} error={t(errors.vehicle_id?.message ?? '')}>
                <select {...register('vehicle_id')} className={selectClass} disabled={refsLoading}>
                  <option value="">{refsLoading ? t('assignmentForm.loading') : t('assignmentForm.noVehicle')}</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate_number} — {vehicle.brand} {vehicle.model}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={`${t('assignmentForm.company')} *`} error={t(errors.company_id?.message ?? '')}>
              <select {...register('company_id')} className={selectClass} disabled={refsLoading}>
                <option value="">{refsLoading ? t('assignmentForm.loading') : t('assignmentForm.selectCompany')}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t('assignmentForm.cargo')} *`} error={t(errors.cargo_name?.message ?? '')}>
                <Input {...register('cargo_name')} placeholder={t('assignmentForm.cargoPlaceholder')} />
              </Field>
              <Field label={`${t('assignmentForm.cargoOwner')} *`} error={t(errors.cargo_owner?.message ?? '')}>
                <Input {...register('cargo_owner')} placeholder={t('assignmentForm.cargoOwnerPlaceholder')} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <StructuredAddressFields
                  label={`${t('assignmentForm.pickup')} *`}
                  value={pickupAddress}
                  disabled={refsLoading}
                  onChange={setPickupAddress}
                  onPartsChange={syncPickupAddress}
                />
                {pickupError ? <p className="mt-1 text-xs text-red-600">{t(pickupError)}</p> : null}
              </div>
              <div>
                <StructuredAddressFields
                  label={`${t('assignmentForm.delivery')} *`}
                  value={deliveryAddress}
                  disabled={refsLoading}
                  onChange={setDeliveryAddress}
                  onPartsChange={syncDeliveryAddress}
                />
                {deliveryError ? <p className="mt-1 text-xs text-red-600">{t(deliveryError)}</p> : null}
              </div>
            </div>

            {routePreview ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('assignmentForm.routePreview')}
                </p>
                <p className="mt-1 text-sm text-slate-900">{routePreview}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={`${t('assignmentForm.date')} *`} error={t(errors.work_date?.message ?? '')}>
                <Input type="date" {...register('work_date')} />
              </Field>
              <Field label={`${t('assignmentForm.startTime')} *`} error={t(errors.start_time?.message ?? '')}>
                <Input type="time" {...register('start_time')} />
              </Field>
              <Field label={`${t('assignmentForm.endTime')} *`} error={t(errors.end_time?.message ?? '')}>
                <Input type="time" {...register('end_time')} />
              </Field>
            </div>

            <Field label={t('assignmentForm.expectedRevenue')} error={t(errors.expected_daily_revenue?.message ?? '')}>
              <Input type="number" step="0.01" min="0" {...register('expected_daily_revenue')} placeholder={t('assignmentForm.optional')} />
            </Field>

            <Field label={t('assignmentForm.notes')} error={t(errors.notes?.message ?? '')}>
              <Input {...register('notes')} placeholder={t('assignmentForm.notesPlaceholder')} />
            </Field>
          </CardContent>
        </Card>

        {serverError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || refsLoading}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('assignmentForm.creating')}
              </>
            ) : (
              t('assignmentForm.create')
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href="/assignments">{t('assignmentForm.cancel')}</Link>
          </Button>
        </div>
      </form>

      <LicenseComplianceWarningDialog
        open={licenseWarningOpen}
        onOpenChange={setLicenseWarningOpen}
        onConfirm={() => {
          if (pendingSubmit) {
            void createAssignment(pendingSubmit, true);
          }
          setLicenseWarningOpen(false);
          setPendingSubmit(null);
        }}
        onCancel={() => setPendingSubmit(null)}
      />
    </div>
  );
}
