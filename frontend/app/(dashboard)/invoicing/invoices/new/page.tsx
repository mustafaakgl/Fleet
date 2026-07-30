'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InvoiceLineEditor } from '@/components/invoicing/InvoiceLineEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companiesApi, getApiErrorMessage, invoicingApi } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
} from '@/lib/fleet-table';
import { centsToEuro, computeLineTotals, taxPresetKey } from '@/lib/invoicing-format';
import { formatFleetCurrency } from '@/lib/locale-format';
import { showToast } from '@/lib/toast';
import type { Company, InvoiceLine, InvoiceLinePayload } from '@/lib/types';

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthInput(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** Local, not-yet-persisted line: the backend only accepts lines together with the draft. */
function toLocalLine(payload: InvoiceLinePayload, position: number, id: string): InvoiceLine {
  const totals = computeLineTotals(
    payload.quantity,
    payload.unitPriceCents,
    payload.taxRateBasisPoints,
  ) ?? { netCents: 0, taxCents: 0, grossCents: 0 };

  return {
    id,
    position,
    description: payload.description,
    quantity: payload.quantity,
    unit: payload.unit,
    unitPriceCents: payload.unitPriceCents,
    taxRateBasisPoints: payload.taxRateBasisPoints,
    taxCategory: payload.taxCategory,
    netCents: totals.netCents,
    taxCents: totals.taxCents,
    grossCents: totals.grossCents,
    source: 'manual',
    serviceDate: payload.serviceDate ?? null,
  };
}

export default function NewInvoicePage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [servicePeriodStart, setServicePeriodStart] = useState(firstOfMonthInput());
  const [servicePeriodEnd, setServicePeriodEnd] = useState(todayInput());
  const [invoiceDate, setInvoiceDate] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void companiesApi
      .list({ limit: 200 })
      .then((response) => setCompanies(response.data))
      .catch(() => setCompanies([]));
  }, []);

  const totals = useMemo(() => {
    const netCents = lines.reduce((sum, line) => sum + line.netCents, 0);
    const taxCents = lines.reduce((sum, line) => sum + line.taxCents, 0);
    return { netCents, taxCents, grossCents: netCents + taxCents };
  }, [lines]);

  const addLine = useCallback(async (payload: InvoiceLinePayload) => {
    setLines((current) => [
      ...current,
      toLocalLine(payload, current.length + 1, `local-${Date.now()}-${current.length}`),
    ]);
  }, []);

  const updateLine = useCallback(
    async (lineId: string, payload: Partial<InvoiceLinePayload>) => {
      setLines((current) =>
        current.map((line) =>
          line.id === lineId
            ? toLocalLine(
                {
                  description: payload.description ?? line.description,
                  quantity: payload.quantity ?? line.quantity,
                  unit: payload.unit ?? line.unit,
                  unitPriceCents: payload.unitPriceCents ?? line.unitPriceCents,
                  taxCategory: payload.taxCategory ?? line.taxCategory,
                  taxRateBasisPoints: payload.taxRateBasisPoints ?? line.taxRateBasisPoints,
                },
                line.position,
                line.id,
              )
            : line,
        ),
      );
    },
    [],
  );

  const deleteLine = useCallback(async (lineId: string) => {
    setLines((current) =>
      current
        .filter((line) => line.id !== lineId)
        .map((line, index) => ({ ...line, position: index + 1 })),
    );
  }, []);

  const submit = async () => {
    if (!companyId) {
      setError(t('invoicing.new.companyRequired'));
      return;
    }
    if (lines.length === 0) {
      setError(t('invoicing.new.linesRequired'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const draft = await invoicingApi.createDraft({
        companyId,
        servicePeriodStart,
        servicePeriodEnd,
        invoiceDate,
        assignmentIds: [],
        notes: notes.trim() || undefined,
        manualLines: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          taxCategory: line.taxCategory,
          taxRateBasisPoints: line.taxRateBasisPoints,
        })),
      });
      showToast({ message: t('invoicing.new.createdFeedback'), type: 'success' });
      router.push(`/invoicing/invoices/${draft.id}`);
    } catch (caught) {
      setError(getApiErrorMessage(caught, t('invoicing.new.createError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <Link
            href="/invoicing"
            className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('invoicing.detail.backToList')}
          </Link>
          <h1 className={FLEET_PAGE_TITLE}>{t('invoicing.new.title')}</h1>
          <p className="text-[13px] text-slate-500">{t('invoicing.new.subtitle')}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t('invoicing.detail.headerSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="companyId">{t('invoicing.new.company')}</Label>
                  <select
                    id="companyId"
                    value={companyId}
                    onChange={(event) => setCompanyId(event.target.value)}
                    className={FLEET_FILTER_SELECT}
                  >
                    <option value="">{t('invoicing.new.companyPlaceholder')}</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="invoiceDate">{t('invoicing.detail.invoiceDate')}</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="servicePeriodStart">
                    {t('invoicing.detail.servicePeriodStart')}
                  </Label>
                  <Input
                    id="servicePeriodStart"
                    type="date"
                    value={servicePeriodStart}
                    onChange={(event) => setServicePeriodStart(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="servicePeriodEnd">
                    {t('invoicing.detail.servicePeriodEnd')}
                  </Label>
                  <Input
                    id="servicePeriodEnd"
                    type="date"
                    value={servicePeriodEnd}
                    onChange={(event) => setServicePeriodEnd(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">{t('invoicing.detail.notes')}</Label>
                <textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t('invoicing.detail.linesSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <InvoiceLineEditor
                lines={lines}
                editable
                busy={saving}
                onAddLine={addLine}
                onUpdateLine={updateLine}
                onDeleteLine={deleteLine}
              />
              {lines.length === 0 ? (
                <p className="px-3 pb-3 text-[13px] text-slate-500">
                  {t('invoicing.new.linesHint')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t('invoicing.detail.totalsSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{t('invoicing.detail.net')}</span>
                <span className="font-medium text-slate-900">
                  {formatFleetCurrency(centsToEuro(totals.netCents))}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{t('invoicing.detail.tax')}</span>
                <span className="font-medium text-slate-900">
                  {formatFleetCurrency(centsToEuro(totals.taxCents))}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base">
                <span className="font-semibold text-slate-900">{t('invoicing.detail.gross')}</span>
                <span className="font-semibold text-slate-900">
                  {formatFleetCurrency(centsToEuro(totals.grossCents))}
                </span>
              </div>

              {lines.length > 0 ? (
                <p className="pt-2 text-xs text-slate-500">
                  {t('invoicing.new.taxSummary', {
                    preset: t(
                      `invoicing.taxPreset.${taxPresetKey(
                        lines[0].taxCategory,
                        lines[0].taxRateBasisPoints,
                      )}`,
                    ),
                  })}
                </p>
              ) : null}

              <Button className="mt-3 w-full" disabled={saving} onClick={() => void submit()}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Receipt className="mr-2 h-4 w-4" aria-hidden />
                )}
                {t('invoicing.new.create')}
              </Button>
              <p className="text-xs text-slate-500">{t('invoicing.new.createHint')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
