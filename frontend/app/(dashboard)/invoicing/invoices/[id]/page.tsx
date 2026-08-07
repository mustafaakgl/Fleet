'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Download,
  FileCode2,
  Loader2,
  Lock,
  Receipt,
  RefreshCw,
  Send,
  Undo2,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InvoiceLineEditor } from '@/components/invoicing/InvoiceLineEditor';
import { InvoiceStatusBadge } from '@/components/invoicing/InvoiceStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiErrorMessage, invoicingApi } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
} from '@/lib/fleet-table';
import { centsToEuro, centsToEuroInput, euroInputToCents } from '@/lib/invoicing-format';
import { formatFleetCurrency, formatFleetDate, formatFleetDateTime } from '@/lib/locale-format';
import { showToast } from '@/lib/toast';
import type {
  InvoiceDetail,
  InvoiceLinePayload,
  InvoicePaymentMethod,
  UpdateInvoiceDraftPayload,
} from '@/lib/types';

const PAYMENT_METHODS: InvoicePaymentMethod[] = ['bank_transfer', 'cash', 'other'];

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [header, setHeader] = useState<UpdateInvoiceDraftPayload>({});
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('0.00');
  const [paymentDate, setPaymentDate] = useState(todayInput());
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  const applyInvoice = useCallback((next: InvoiceDetail) => {
    setInvoice(next);
    setHeader({
      servicePeriodStart: toDateInput(next.servicePeriodStart),
      servicePeriodEnd: toDateInput(next.servicePeriodEnd),
      invoiceDate: toDateInput(next.invoiceDate),
      paymentTermDays: next.paymentTermDays,
      notes: next.notes ?? '',
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyInvoice(await invoicingApi.getInvoice(id));
    } catch (caught) {
      setInvoice(null);
      setError(getApiErrorMessage(caught, t('invoicing.detail.loadError')));
    } finally {
      setLoading(false);
    }
  }, [applyInvoice, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDraft = invoice?.status === 'draft';

  // The PDF only exists once the invoice is finalized; drafts have no rendered document.
  useEffect(() => {
    if (!invoice || invoice.status === 'draft') return;

    let cancelled = false;
    void invoicingApi
      .downloadPdf(invoice.id)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        pdfUrlRef.current = url;
        setPdfUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      });

    return () => {
      cancelled = true;
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [invoice]);

  const openCents = invoice ? Math.max(0, invoice.grossCents - invoice.paidCents) : 0;

  // taxBreakdown is a Json column, so a row written by an older or third-party
  // path can hold something other than the array the type promises. `?? []` only
  // covers null, and a non-array value reached .map() and took the whole page
  // down with it — the totals still render, so degrade instead of crashing.
  const taxRows = useMemo(
    () => (Array.isArray(invoice?.taxBreakdown) ? invoice.taxBreakdown : []),
    [invoice],
  );

  const runAction = useCallback(
    async (action: () => Promise<InvoiceDetail | unknown>, successMessage?: string) => {
      setBusy(true);
      setActionError(null);
      try {
        const result = await action();
        if (result && typeof result === 'object' && 'lines' in result) {
          applyInvoice(result as InvoiceDetail);
        } else {
          applyInvoice(await invoicingApi.getInvoice(id));
        }
        if (successMessage) showToast({ message: successMessage, type: 'success' });
      } catch (caught) {
        setActionError(getApiErrorMessage(caught, t('invoicing.detail.actionError')));
      } finally {
        setBusy(false);
      }
    },
    [applyInvoice, id, t],
  );

  const saveHeader = () =>
    runAction(
      () =>
        invoicingApi.updateDraft(id, {
          servicePeriodStart: header.servicePeriodStart,
          servicePeriodEnd: header.servicePeriodEnd,
          invoiceDate: header.invoiceDate,
          paymentTermDays: header.paymentTermDays,
          notes: header.notes ?? '',
        }),
      t('invoicing.detail.savedFeedback'),
    );

  const addLine = (payload: InvoiceLinePayload) =>
    runAction(() => invoicingApi.addLine(id, payload));

  const updateLine = (lineId: string, payload: Partial<InvoiceLinePayload>) =>
    runAction(() => invoicingApi.updateLine(id, lineId, payload));

  const deleteLine = (lineId: string) => runAction(() => invoicingApi.deleteLine(id, lineId));

  const finalize = async () => {
    setFinalizeOpen(false);
    await runAction(() => invoicingApi.finalize(id), t('invoicing.detail.finalizedFeedback'));
  };

  const send = () =>
    runAction(() => invoicingApi.send(id), t('invoicing.detail.sentFeedback'));

  const submitPayment = async () => {
    const cents = euroInputToCents(paymentAmount);
    if (cents === null || cents <= 0) {
      setActionError(t('invoicing.detail.paymentAmountInvalid'));
      return;
    }
    setPaymentOpen(false);
    await runAction(
      () =>
        invoicingApi.addPayment(id, {
          amountCents: cents,
          paidAt: new Date(`${paymentDate}T12:00:00.000Z`).toISOString(),
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
        }),
      t('invoicing.detail.paymentSavedFeedback'),
    );
    setPaymentReference('');
  };

  const download = async (kind: 'pdf' | 'xml') => {
    setActionError(null);
    try {
      const blob =
        kind === 'pdf' ? await invoicingApi.downloadPdf(id) : await invoicingApi.downloadXml(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${invoice?.number ?? id}.${kind}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setActionError(getApiErrorMessage(caught, t('invoicing.detail.downloadError')));
    }
  };

  if (loading) {
    return (
      <div className={FLEET_PAGE}>
        <p className="text-[13px] text-slate-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className={FLEET_PAGE}>
        <Card className={FLEET_LIST_CARD}>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
            <p className="text-sm text-slate-700">{error ?? t('invoicing.detail.loadError')}</p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <h1 className={FLEET_PAGE_TITLE}>
            {invoice.number ?? t('invoicing.table.draftNumber')}
          </h1>
          <p className="text-[13px] text-slate-500">
            {t('invoicing.detail.subtitle', {
              company: invoice.company.name,
              from: formatFleetDate(invoice.servicePeriodStart),
              to: formatFleetDate(invoice.servicePeriodEnd),
            })}
          </p>
        </div>
        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <InvoiceStatusBadge status={invoice.status} />
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {actionError}
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor="servicePeriodStart">
                    {t('invoicing.detail.servicePeriodStart')}
                  </Label>
                  <Input
                    id="servicePeriodStart"
                    type="date"
                    value={header.servicePeriodStart ?? ''}
                    disabled={!isDraft || busy}
                    onChange={(event) =>
                      setHeader((current) => ({
                        ...current,
                        servicePeriodStart: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="servicePeriodEnd">
                    {t('invoicing.detail.servicePeriodEnd')}
                  </Label>
                  <Input
                    id="servicePeriodEnd"
                    type="date"
                    value={header.servicePeriodEnd ?? ''}
                    disabled={!isDraft || busy}
                    onChange={(event) =>
                      setHeader((current) => ({ ...current, servicePeriodEnd: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceDate">{t('invoicing.detail.invoiceDate')}</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={header.invoiceDate ?? ''}
                    disabled={!isDraft || busy}
                    onChange={(event) =>
                      setHeader((current) => ({ ...current, invoiceDate: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="paymentTermDays">{t('invoicing.detail.paymentTermDays')}</Label>
                  <Input
                    id="paymentTermDays"
                    type="number"
                    min={0}
                    max={365}
                    value={header.paymentTermDays ?? 0}
                    disabled={!isDraft || busy}
                    onChange={(event) =>
                      setHeader((current) => ({
                        ...current,
                        paymentTermDays: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">{t('invoicing.detail.notes')}</Label>
                <textarea
                  id="notes"
                  rows={2}
                  value={header.notes ?? ''}
                  disabled={!isDraft || busy}
                  onChange={(event) =>
                    setHeader((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              {isDraft ? (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void saveHeader()}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                    {t('invoicing.detail.saveHeader')}
                  </Button>
                </div>
              ) : null}
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
                lines={invoice.lines}
                editable={Boolean(isDraft)}
                busy={busy}
                onAddLine={addLine}
                onUpdateLine={updateLine}
                onDeleteLine={deleteLine}
              />
            </CardContent>
          </Card>

          {!isDraft ? (
            <>
              <Card className={FLEET_LIST_CARD}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t('invoicing.detail.pdfPreview')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      title={t('invoicing.detail.pdfPreview')}
                      className="h-[520px] w-full rounded-md border border-slate-200"
                    />
                  ) : (
                    <p className="text-[13px] text-slate-500">
                      {t('invoicing.detail.pdfUnavailable')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className={FLEET_LIST_CARD}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t('invoicing.detail.paymentsSection')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {invoice.payments.length === 0 ? (
                    <p className="text-[13px] text-slate-500">
                      {t('invoicing.detail.paymentsEmpty')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-200 text-[13px]">
                      {invoice.payments.map((payment) => (
                        <li key={payment.id} className="flex items-center justify-between py-2">
                          <span className="text-slate-700">
                            {formatFleetDate(payment.paidAt)} ·{' '}
                            {t(`invoicing.paymentMethod.${payment.method}`)}
                            {payment.reference ? ` · ${payment.reference}` : ''}
                          </span>
                          <span className="font-medium text-slate-900">
                            {formatFleetCurrency(centsToEuro(payment.amountCents))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className={FLEET_LIST_CARD}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t('invoicing.detail.dunningSection')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {invoice.dunningNotices.length === 0 ? (
                    <p className="text-[13px] text-slate-500">
                      {t('invoicing.detail.dunningEmpty')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-200 text-[13px]">
                      {invoice.dunningNotices.map((notice) => (
                        <li key={notice.id} className="flex items-center justify-between py-2">
                          <span className="flex items-center gap-2 text-slate-700">
                            <Badge
                              variant={
                                notice.level >= 3
                                  ? 'destructive'
                                  : notice.level === 2
                                    ? 'orange'
                                    : 'warning'
                              }
                            >
                              {t('invoicing.detail.dunningLevel', { level: notice.level })}
                            </Badge>
                            {notice.sentAt
                              ? formatFleetDateTime(notice.sentAt)
                              : t('invoicing.detail.dunningNotSent')}
                          </span>
                          <span className="font-medium text-slate-900">
                            {formatFleetCurrency(centsToEuro(notice.feeCents))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
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
                  {formatFleetCurrency(centsToEuro(invoice.netCents))}
                </span>
              </div>

              {taxRows.map((row) => (
                <div
                  key={`${row.taxCategory}-${row.taxRateBasisPoints}`}
                  className="flex items-center justify-between text-slate-600"
                >
                  <span>
                    {t('invoicing.detail.taxRow', {
                      rate: (row.taxRateBasisPoints / 100).toFixed(0),
                      category: t(`invoicing.taxCategory.${row.taxCategory}`),
                    })}
                  </span>
                  <span>{formatFleetCurrency(centsToEuro(row.taxCents))}</span>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-600">{t('invoicing.detail.tax')}</span>
                <span className="font-medium text-slate-900">
                  {formatFleetCurrency(centsToEuro(invoice.taxCents))}
                </span>
              </div>
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold text-slate-900">{t('invoicing.detail.gross')}</span>
                <span className="font-semibold text-slate-900">
                  {formatFleetCurrency(centsToEuro(invoice.grossCents))}
                </span>
              </div>

              {!isDraft ? (
                <>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>{t('invoicing.detail.paid')}</span>
                    <span>{formatFleetCurrency(centsToEuro(invoice.paidCents))}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>{t('invoicing.detail.openAmount')}</span>
                    <span>{formatFleetCurrency(centsToEuro(openCents))}</span>
                  </div>
                  {invoice.dueDate ? (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>{t('invoicing.table.dueDate')}</span>
                      <span>{formatFleetDate(invoice.dueDate)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t('invoicing.detail.actionsSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isDraft ? (
                <>
                  <Button
                    className="w-full"
                    disabled={busy}
                    onClick={() => setFinalizeOpen(true)}
                  >
                    <Lock className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.finalize')}
                  </Button>
                  <p className="text-xs text-slate-500">{t('invoicing.detail.finalizeHint')}</p>
                </>
              ) : (
                <>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={busy || invoice.status === 'cancelled'}
                    onClick={() => void send()}
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.send')}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={busy || invoice.status === 'cancelled' || openCents === 0}
                    onClick={() => {
                      setPaymentAmount(centsToEuroInput(openCents));
                      setPaymentDate(todayInput());
                      setPaymentOpen(true);
                    }}
                  >
                    <Wallet className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.recordPayment')}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled
                    title={t('invoicing.detail.notAvailableYet')}
                  >
                    <Ban className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.storno')}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled
                    title={t('invoicing.detail.notAvailableYet')}
                  >
                    <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.creditNote')}
                  </Button>
                  <p className="text-xs text-slate-500">{t('invoicing.detail.notAvailableYet')}</p>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => void download('pdf')}
                  >
                    <Download className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.downloadPdf')}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => void download('xml')}
                  >
                    <FileCode2 className="mr-2 h-4 w-4" aria-hidden />
                    {t('invoicing.detail.downloadXml')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {!isDraft && invoice.deliveryAttempts.length > 0 ? (
            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  {t('invoicing.detail.deliverySection')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-[13px] text-slate-600">
                  {invoice.deliveryAttempts.map((attempt) => (
                    <li key={attempt.id} className="flex items-center justify-between gap-2">
                      <span>{formatFleetDateTime(attempt.attemptedAt)}</span>
                      <Badge variant={attempt.succeeded ? 'success' : 'destructive'}>
                        {attempt.succeeded
                          ? t('invoicing.detail.deliverySucceeded')
                          : t('invoicing.detail.deliveryFailed')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-slate-500" aria-hidden />
              {t('invoicing.detail.finalizeConfirmTitle')}
            </DialogTitle>
            <DialogDescription>{t('invoicing.detail.finalizeConfirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void finalize()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {t('invoicing.detail.finalizeConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-slate-500" aria-hidden />
              {t('invoicing.detail.paymentDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('invoicing.detail.paymentDialogBody', {
                amount: formatFleetCurrency(centsToEuro(openCents)),
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="paymentAmount">{t('invoicing.detail.paymentAmount')}</Label>
              <Input
                id="paymentAmount"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="paymentDate">{t('invoicing.detail.paymentDate')}</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="paymentMethod">{t('invoicing.detail.paymentMethod')}</Label>
              <select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as InvoicePaymentMethod)
                }
                className={FLEET_FILTER_SELECT}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`invoicing.paymentMethod.${method}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="paymentReference">{t('invoicing.detail.paymentReference')}</Label>
              <Input
                id="paymentReference"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitPayment()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {t('invoicing.detail.paymentSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
