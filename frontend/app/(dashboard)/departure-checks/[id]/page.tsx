'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { departureChecksApi, getApiErrorMessage } from '@/lib/api';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import type { DepartureCheck } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export default function DepartureCheckDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [check, setCheck] = useState<DepartureCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    departureChecksApi
      .getById(params.id)
      .then(setCheck)
      .catch((e) => setError(getApiErrorMessage(e, t('departureChecks.loadError'))))
      .finally(() => setLoading(false));
  }, [params.id, t]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (!check) {
    return (
      <div className={FLEET_PAGE}>
        <p className="text-rose-600">{error ?? t('departureChecks.notFound')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/departure-checks">{t('departureChecks.backToList')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/departure-checks">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <ClipboardCheck className="h-7 w-7 text-blue-700" />
          <div>
            <h1 className={FLEET_PAGE_TITLE}>
              {check.vehicle.plate_number} — {formatDate(check.work_date)}
            </h1>
            <p className="text-sm text-slate-600">{check.driver.name}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('departureChecks.detail.overview')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-slate-500">{t('departureChecks.colStatus')}</div>
            <div className="font-medium">{t(`departureChecks.overall.${check.overall_status}`)}</div>
          </div>
          <div>
            <div className="text-slate-500">{t('departureChecks.colDate')}</div>
            <div className="font-medium">{formatDate(check.performed_at)}</div>
          </div>
          {check.assignment ? (
            <div>
              <div className="text-slate-500">{t('departureChecks.detail.company')}</div>
              <div className="font-medium">{check.assignment.company_name}</div>
            </div>
          ) : null}
          {check.template_name ? (
            <div>
              <div className="text-slate-500">{t('departureChecks.detail.template')}</div>
              <div className="font-medium">{check.template_name}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('departureChecks.detail.checklist')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {check.item_results.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{item.item_label}</span>
                <span className="text-slate-600">{t(`departureChecks.item.${item.result}`, item.result)}</span>
              </div>
              {item.defect_description ? (
                <p className="mt-1 text-slate-600">{item.defect_description}</p>
              ) : null}
              {item.photo_count > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  {t('departureChecks.detail.photos', { count: item.photo_count })}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {check.defects && check.defects.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('departureChecks.detail.defects')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {check.defects.map((defect) => (
              <Link
                key={defect.id}
                href={`/defects/${defect.id}`}
                className="block rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
              >
                <span className="font-medium">{defect.title}</span>
                <span className="ml-2 text-slate-500">
                  {defect.severity} · {defect.status}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
