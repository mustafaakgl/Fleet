'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage, invoicingApi } from '@/lib/api';
import { formatFleetCurrency } from '@/lib/locale-format';
import type {
  OutgoingInvoiceListItem,
  OutgoingInvoiceStatus,
  UninvoicedCompany,
} from '@/lib/types';

const OPEN_STATUSES: OutgoingInvoiceStatus[] = ['finalized', 'sent', 'partially_paid', 'overdue'];

function centsToEuro(cents: number): number {
  return cents / 100;
}

function openCentsOf(invoice: OutgoingInvoiceListItem): number {
  return Math.max(0, invoice.grossCents - invoice.paidCents);
}

function isOpenInvoice(invoice: OutgoingInvoiceListItem): boolean {
  return OPEN_STATUSES.includes(invoice.status) && openCentsOf(invoice) > 0;
}

function isOverdueInvoice(invoice: OutgoingInvoiceListItem, now: number): boolean {
  if (!isOpenInvoice(invoice)) return false;
  if (invoice.status === 'overdue') return true;
  return invoice.dueDate ? new Date(invoice.dueDate).getTime() < now : false;
}

function SummaryCard({
  label,
  value,
  subtitle,
  href,
  tone,
}: {
  label: string;
  value: string;
  subtitle: string;
  href: string;
  tone: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full rounded-lg border-slate-200 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pb-4">
          <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function InvoicingSummaryCards() {
  const { t } = useTranslation();
  const [uninvoiced, setUninvoiced] = useState<UninvoicedCompany[]>([]);
  const [invoices, setInvoices] = useState<OutgoingInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uninvoicedRows, invoiceRows] = await Promise.all([
        invoicingApi.listUninvoiced(),
        invoicingApi.listInvoices(),
      ]);
      setUninvoiced(uninvoicedRows);
      setInvoices(invoiceRows);
    } catch (caught) {
      setUninvoiced([]);
      setInvoices([]);
      setError(getApiErrorMessage(caught, t('dashboard.v3.invoicing.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    const now = Date.now();
    const uninvoicedCount = uninvoiced.reduce((sum, group) => sum + group.assignmentCount, 0);
    const uninvoicedAmountCents = uninvoiced.reduce((sum, group) => sum + group.suggestedNetCents, 0);
    const overdueRows = invoices.filter((invoice) => isOverdueInvoice(invoice, now));
    const overdueCount = overdueRows.length;
    const overdueAmountCents = overdueRows.reduce((sum, invoice) => sum + openCentsOf(invoice), 0);

    return [
      {
        key: 'uninvoiced',
        label: t('dashboard.v3.invoicing.uninvoicedTitle'),
        value: formatFleetCurrency(centsToEuro(uninvoicedAmountCents)),
        subtitle: t('dashboard.v3.invoicing.uninvoicedSubtitle', { count: uninvoicedCount }),
        href: '/invoicing?tab=uninvoiced',
        tone: uninvoicedCount > 0 ? 'text-blue-700' : 'text-slate-900',
      },
      {
        key: 'overdue',
        label: t('dashboard.v3.invoicing.overdueTitle'),
        value: formatFleetCurrency(centsToEuro(overdueAmountCents)),
        subtitle: t('dashboard.v3.invoicing.overdueSubtitle', { count: overdueCount }),
        href: '/invoicing?tab=overdue',
        tone: overdueCount > 0 ? 'text-red-700' : 'text-slate-900',
      },
    ];
  }, [invoices, t, uninvoiced]);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-900">
          {t('dashboard.v3.invoicing.sectionTitle')}
        </h2>
        <p className="text-xs text-slate-500">{t('dashboard.v3.invoicing.sectionSubtitle')}</p>
      </div>

      {loading ? (
        <Skeleton className="h-28 w-full" />
      ) : error ? (
        <Card className="rounded-lg border-red-200 bg-red-50 shadow-sm">
          <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {cards.map(({ key, ...card }) => (
            <SummaryCard key={key} {...card} />
          ))}
        </div>
      )}
    </section>
  );
}