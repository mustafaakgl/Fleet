'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Loader2, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { assignmentsApi, driversApi, vehiclesApi, companiesApi } from '@/lib/api';
import type { Driver, Vehicle, Company } from '@/lib/types';

const schema = z.object({
  driver_id: z.string().min(1, 'assignmentForm.driverRequired'),
  vehicle_id: z.string().optional(),
  company_id: z.string().min(1, 'assignmentForm.companyRequired'),
  cargo_name: z.string().min(1, 'assignmentForm.required'),
  cargo_owner: z.string().min(1, 'assignmentForm.required'),
  pickup_address: z.string().min(1, 'assignmentForm.required'),
  delivery_address: z.string().min(1, 'assignmentForm.required'),
  work_date: z.string().min(1, 'assignmentForm.required'),
  start_time: z.string().min(1, 'assignmentForm.required'),
  end_time: z.string().min(1, 'assignmentForm.required'),
  route_name: z.string().optional(),
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

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

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
  }, []);

  async function onSubmit(data: FormData) {
    setServerError(null);
    const company = companies.find((item) => item.id === data.company_id);
    try {
      await assignmentsApi.create({
        driver_id: data.driver_id,
        vehicle_id: data.vehicle_id || undefined,
        company_id: data.company_id,
        company_name: company?.name,
        cargo_name: data.cargo_name,
        cargo_owner: data.cargo_owner,
        pickup_address: data.pickup_address,
        delivery_address: data.delivery_address,
        work_date: data.work_date,
        start_time: data.start_time,
        end_time: data.end_time,
        route_name: data.route_name || undefined,
        expected_daily_revenue: data.expected_daily_revenue,
        notes: data.notes || undefined,
      });
      router.push('/assignments');
    } catch (err: unknown) {
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
        <h1 className="text-2xl font-bold text-gray-900">{t('assignmentForm.title')}</h1>
      </div>

      {refsError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{refsError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t('assignmentForm.pickup')} *`} error={t(errors.pickup_address?.message ?? '')}>
                <Input {...register('pickup_address')} placeholder={t('assignmentForm.addressPlaceholder')} />
              </Field>
              <Field label={`${t('assignmentForm.delivery')} *`} error={t(errors.delivery_address?.message ?? '')}>
                <Input {...register('delivery_address')} placeholder={t('assignmentForm.addressPlaceholder')} />
              </Field>
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('assignmentForm.route')} error={t(errors.route_name?.message ?? '')}>
                <Input {...register('route_name')} placeholder={t('assignmentForm.optional')} />
              </Field>
              <Field label={t('assignmentForm.expectedRevenue')} error={t(errors.expected_daily_revenue?.message ?? '')}>
                <Input type="number" step="0.01" min="0" {...register('expected_daily_revenue')} placeholder={t('assignmentForm.optional')} />
              </Field>
            </div>

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
    </div>
  );
}
