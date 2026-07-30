'use client';

import { useMemo, useState } from 'react';
import { FileText, Inbox, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getApiErrorMessage, invoicingApi } from '@/lib/api';
import {
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
import type { CreatedInvoiceDraft, UninvoicedCompany } from '@/lib/types';
import { cn } from '@/lib/utils';

function centsToEuro(cents: number): number {
  return cents / 100;
}

function toIsoDay(value: string): string {
  return value.slice(0, 10);
}

export function UninvoicedPanel({
  groups,
  loading,
  onCreated,
}: {
  groups: UninvoicedCompany[];
  loading: boolean;
  onCreated: (invoice: CreatedInvoiceDraft, companyName: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.companyId === selectedCompanyId) ?? null,
    [groups, selectedCompanyId],
  );

  const selectedNetCents = useMemo(() => {
    if (!selectedGroup) return 0;
    return selectedGroup.assignments
      .filter((assignment) => selectedIds.includes(assignment.id))
      .reduce((sum, assignment) => sum + (assignment.suggestedNetCents ?? 0), 0);
  }, [selectedGroup, selectedIds]);

  function toggleAssignment(companyId: string, assignmentId: string) {
    setError(null);
    if (companyId !== selectedCompanyId) {
      setSelectedCompanyId(companyId);
      setSelectedIds([assignmentId]);
      return;
    }
    setSelectedIds((current) => {
      const next = current.includes(assignmentId)
        ? current.filter((id) => id !== assignmentId)
        : [...current, assignmentId];
      if (next.length === 0) setSelectedCompanyId(null);
      return next;
    });
  }

  function toggleCompany(group: UninvoicedCompany) {
    setError(null);
    const billableIds = group.assignments
      .filter((assignment) => assignment.suggestedNetCents !== null)
      .map((assignment) => assignment.id);
    const allSelected =
      group.companyId === selectedCompanyId &&
      billableIds.length > 0 &&
      billableIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedCompanyId(null);
      setSelectedIds([]);
      return;
    }
    setSelectedCompanyId(group.companyId);
    setSelectedIds(billableIds);
  }

  async function createInvoice() {
    if (!selectedGroup || selectedIds.length === 0) return;
    const selectedAssignments = selectedGroup.assignments.filter((assignment) =>
      selectedIds.includes(assignment.id),
    );
    const workDates = selectedAssignments.map((assignment) => toIsoDay(assignment.workDate)).sort();

    setSubmitting(true);
    setError(null);
    try {
      const invoice = await invoicingApi.createDraft({
        companyId: selectedGroup.companyId,
        assignmentIds: selectedAssignments.map((assignment) => assignment.id),
        servicePeriodStart: workDates[0],
        servicePeriodEnd: workDates[workDates.length - 1],
      });
      setSelectedCompanyId(null);
      setSelectedIds([]);
      onCreated(invoice, selectedGroup.companyName);
    } catch (caught) {
      setError(getApiErrorMessage(caught, t('invoicing.uninvoiced.createError')));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-[13px] text-slate-500">{t('common.loading')}</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Inbox}
          title={t('invoicing.empty.uninvoicedTitle')}
          subtitle={t('invoicing.empty.uninvoicedDescription')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-[13px] text-slate-600">{t('invoicing.uninvoiced.description')}</p>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        {groups.map((group) => {
          const billableIds = group.assignments
            .filter((assignment) => assignment.suggestedNetCents !== null)
            .map((assignment) => assignment.id);
          const allSelected =
            group.companyId === selectedCompanyId &&
            billableIds.length > 0 &&
            billableIds.every((id) => selectedIds.includes(id));

          return (
            <div
              key={group.companyId}
              className="overflow-hidden rounded-md border border-slate-200 bg-white"
            >
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={billableIds.length === 0}
                    onChange={() => toggleCompany(group)}
                    aria-label={t('invoicing.uninvoiced.selectAllCompany', {
                      company: group.companyName,
                    })}
                  />
                  <span className="truncate text-[13px] font-semibold text-slate-900">
                    {group.companyName}
                  </span>
                  {group.assignmentsWithoutPrice > 0 ? (
                    <Badge variant="warning">
                      {t('invoicing.uninvoiced.withoutPriceBadge', {
                        count: group.assignmentsWithoutPrice,
                      })}
                    </Badge>
                  ) : null}
                </div>
                <span className="text-[13px] text-slate-600">
                  {t('invoicing.uninvoiced.companySummary', {
                    count: group.assignmentCount,
                    amount: formatFleetCurrency(centsToEuro(group.suggestedNetCents)),
                  })}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className={FLEET_RAW_TABLE}>
                  <thead className={FLEET_RAW_THEAD}>
                    <tr>
                      <th className={FLEET_RAW_TH_CHECKBOX} />
                      <th className={FLEET_RAW_TH}>{t('invoicing.uninvoiced.colWorkDate')}</th>
                      <th className={FLEET_RAW_TH}>{t('invoicing.uninvoiced.colCargo')}</th>
                      <th className={FLEET_RAW_TH}>{t('invoicing.uninvoiced.colRoute')}</th>
                      <th className={FLEET_RAW_TH}>{t('invoicing.uninvoiced.colAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className={FLEET_RAW_TBODY}>
                    {group.assignments.map((assignment) => {
                      const withoutPrice = assignment.suggestedNetCents === null;
                      const checked =
                        group.companyId === selectedCompanyId &&
                        selectedIds.includes(assignment.id);

                      return (
                        <tr
                          key={assignment.id}
                          className={cn(FLEET_RAW_TR, withoutPrice && 'bg-amber-50/70')}
                        >
                          <td className={FLEET_RAW_TH_CHECKBOX}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={withoutPrice}
                              onChange={() => toggleAssignment(group.companyId, assignment.id)}
                              aria-label={assignment.cargoName}
                            />
                          </td>
                          <td className={FLEET_RAW_TD}>{formatFleetDate(assignment.workDate)}</td>
                          <td className={FLEET_RAW_TD_PRIMARY}>{assignment.cargoName}</td>
                          <td className={FLEET_RAW_TD_MUTED}>
                            {assignment.routeName ??
                              `${assignment.pickupAddress} → ${assignment.deliveryAddress}`}
                          </td>
                          <td className={FLEET_RAW_TD}>
                            {withoutPrice ? (
                              <span
                                className="font-medium text-amber-700"
                                title={t('invoicing.uninvoiced.noPriceHint')}
                              >
                                {t('invoicing.uninvoiced.noPrice')}
                              </span>
                            ) : (
                              formatFleetCurrency(centsToEuro(assignment.suggestedNetCents ?? 0))
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[13px] text-slate-700">
          {selectedIds.length > 0 ? (
            <span className="font-semibold">
              {t('invoicing.uninvoiced.selectedSummary', {
                count: selectedIds.length,
                company: selectedGroup?.companyName ?? '',
                amount: formatFleetCurrency(centsToEuro(selectedNetCents)),
              })}
            </span>
          ) : (
            <span className="text-slate-500">{t('invoicing.uninvoiced.singleCompanyHint')}</span>
          )}
        </div>
        <Button
          size="sm"
          disabled={submitting || selectedIds.length === 0}
          onClick={() => void createInvoice()}
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileText className="mr-2 h-4 w-4" aria-hidden />
          )}
          {t('invoicing.uninvoiced.createInvoice')}
        </Button>
      </div>
    </div>
  );
}
