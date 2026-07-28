'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { assignmentsApi, getApiErrorMessage, invoicingApi } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_TH_CHECKBOX,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { formatFleetCurrency, formatFleetDate } from '@/lib/locale-format';
import type { OpenOverdueResponse } from '@/lib/types';

function centsToEuro(cents: number): number {
  return cents / 100;
}

export function OpenOverdueAssignmentsCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<OpenOverdueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await invoicingApi.listOpenOverdue();
      setData(response);
      setSelectedIds([]);
    } catch (caught) {
      setError(getApiErrorMessage(caught, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const allIds = useMemo(
    () => (data?.companies ?? []).flatMap((company) => company.assignments.map((row) => row.id)),
    [data],
  );

  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : allIds);
  }

  function toggleOne(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function completeSelected() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await assignmentsApi.bulkComplete(selectedIds);
      setFeedback(
        t('invoicing.openOverdue.completedFeedback', {
          completed: result.completedCount,
          skipped: result.skipped.length,
        }),
      );
      await load();
    } catch (caught) {
      setError(getApiErrorMessage(caught, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  }

  const totals = data?.totals;
  const hasRows = (data?.companies.length ?? 0) > 0;

  return (
    <Card className={`${FLEET_LIST_CARD} border-amber-200 bg-amber-50/40`}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <CardTitle className="text-base">{t('invoicing.openOverdue.title')}</CardTitle>
          {totals && totals.assignmentCount > 0 ? (
            <Badge variant="destructive">{totals.assignmentCount}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            {t('common.refresh')}
          </Button>
          <Button
            size="sm"
            onClick={() => void completeSelected()}
            disabled={submitting || selectedIds.length === 0}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            {t('invoicing.openOverdue.completeSelected', { count: selectedIds.length })}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[13px] text-slate-600">{t('invoicing.openOverdue.description')}</p>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        ) : null}
        {feedback ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
            {feedback}
          </p>
        ) : null}

        {loading ? (
          <p className="text-[13px] text-slate-500">{t('common.loading')}</p>
        ) : !hasRows ? (
          <EmptyState
            icon={CheckCircle2}
            title={t('invoicing.openOverdue.emptyTitle')}
            subtitle={t('invoicing.openOverdue.emptyDescription')}
          />
        ) : (
          <>
            {totals ? (
              <p className="text-[13px] font-medium text-amber-800">
                {t('invoicing.openOverdue.summary', {
                  assignments: totals.assignmentCount,
                  companies: totals.companyCount,
                  amount: formatFleetCurrency(centsToEuro(totals.potentialNetCents)),
                })}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-md border border-amber-200 bg-white">
              <table className={FLEET_RAW_TABLE}>
                <thead className={FLEET_RAW_THEAD}>
                  <tr>
                    <th className={FLEET_RAW_TH_CHECKBOX}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label={t('invoicing.openOverdue.selectAll')}
                      />
                    </th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colWorkDate')}</th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colCompany')}</th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colCargo')}</th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colDriver')}</th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colStatus')}</th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colDaysOverdue')}</th>
                    <th className={FLEET_RAW_TH}>{t('invoicing.openOverdue.colAmount')}</th>
                  </tr>
                </thead>
                <tbody className={FLEET_RAW_TBODY}>
                  {data?.companies.map((company) =>
                    company.assignments.map((row) => (
                      <tr key={row.id} className={FLEET_RAW_TR}>
                        <td className={FLEET_RAW_TH_CHECKBOX}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleOne(row.id)}
                            aria-label={row.cargoName}
                          />
                        </td>
                        <td className={FLEET_RAW_TD}>{formatFleetDate(row.workDate)}</td>
                        <td className={FLEET_RAW_TD_PRIMARY}>{company.companyName}</td>
                        <td className={FLEET_RAW_TD}>{row.cargoName}</td>
                        <td className={FLEET_RAW_TD_MUTED}>{row.driverName ?? '—'}</td>
                        <td className={FLEET_RAW_TD_MUTED}>
                          {t(`invoicing.status.${row.status}`, { defaultValue: row.status })}
                        </td>
                        <td className={FLEET_RAW_TD}>{row.daysOverdue}</td>
                        <td className={FLEET_RAW_TD}>
                          {row.suggestedNetCents === null
                            ? t('invoicing.openOverdue.noPrice')
                            : formatFleetCurrency(centsToEuro(row.suggestedNetCents))}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
