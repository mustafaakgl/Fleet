'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Settings,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InvoiceTable } from '@/components/invoicing/InvoiceTable';
import { OpenOverdueAssignmentsCard } from '@/components/invoicing/OpenOverdueAssignmentsCard';
import { UninvoicedPanel } from '@/components/invoicing/UninvoicedPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage, invoicingApi } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
  FLEET_TAB_BAR,
  FLEET_TAB_ITEM,
} from '@/lib/fleet-table';
import { formatFleetCurrency } from '@/lib/locale-format';
import type {
  CreatedInvoiceDraft,
  OutgoingInvoiceListItem,
  OutgoingInvoiceStatus,
  UninvoicedCompany,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type ReceivablesTab = 'uninvoiced' | 'drafts' | 'open' | 'overdue' | 'paid';

const TABS: ReceivablesTab[] = ['uninvoiced', 'drafts', 'open', 'overdue', 'paid'];

const OPEN_STATUSES: OutgoingInvoiceStatus[] = ['finalized', 'sent', 'partially_paid', 'overdue'];

/** Revenue window used as the denominator of the DSO estimate. */
const DSO_WINDOW_DAYS = 90;

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

export default function InvoicingPage() {
  const { t } = useTranslation();
  const [uninvoiced, setUninvoiced] = useState<UninvoicedCompany[]>([]);
  const [invoices, setInvoices] = useState<OutgoingInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReceivablesTab>('uninvoiced');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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
      setError(getApiErrorMessage(caught, t('invoicing.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const uninvoicedCents = uninvoiced.reduce((sum, group) => sum + group.suggestedNetCents, 0);
    const openCents = invoices
      .filter((invoice) => isOpenInvoice(invoice))
      .reduce((sum, invoice) => sum + openCentsOf(invoice), 0);
    const overdueCents = invoices
      .filter((invoice) => isOverdueInvoice(invoice, now))
      .reduce((sum, invoice) => sum + openCentsOf(invoice), 0);

    const windowStart = now - DSO_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const billedCents = invoices
      .filter(
        (invoice) =>
          invoice.status !== 'draft' &&
          invoice.status !== 'cancelled' &&
          new Date(invoice.invoiceDate).getTime() >= windowStart,
      )
      .reduce((sum, invoice) => sum + invoice.grossCents, 0);
    const dsoDays = billedCents > 0 ? Math.round((openCents / billedCents) * DSO_WINDOW_DAYS) : null;

    return { uninvoicedCents, openCents, overdueCents, dsoDays };
  }, [invoices, uninvoiced]);

  const companyOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const group of uninvoiced) options.set(group.companyId, group.companyName);
    for (const invoice of invoices) options.set(invoice.company.id, invoice.company.name);
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices, uninvoiced]);

  const filteredInvoices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (companyFilter && invoice.company.id !== companyFilter) return false;
      if (!needle) return true;
      return `${invoice.number ?? ''} ${invoice.company.name}`.toLowerCase().includes(needle);
    });
  }, [companyFilter, invoices, search]);

  const filteredUninvoiced = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return uninvoiced
      .filter((group) => !companyFilter || group.companyId === companyFilter)
      .filter((group) => !needle || group.companyName.toLowerCase().includes(needle));
  }, [companyFilter, search, uninvoiced]);

  const draftRows = useMemo(
    () => filteredInvoices.filter((invoice) => invoice.status === 'draft'),
    [filteredInvoices],
  );
  const openRows = useMemo(() => {
    const now = Date.now();
    return filteredInvoices.filter(
      (invoice) => isOpenInvoice(invoice) && !isOverdueInvoice(invoice, now),
    );
  }, [filteredInvoices]);
  const overdueRows = useMemo(() => {
    const now = Date.now();
    return filteredInvoices.filter((invoice) => isOverdueInvoice(invoice, now));
  }, [filteredInvoices]);
  const paidRows = useMemo(
    () => filteredInvoices.filter((invoice) => invoice.status === 'paid'),
    [filteredInvoices],
  );

  const tabCounts: Record<ReceivablesTab, number> = {
    uninvoiced: filteredUninvoiced.reduce((sum, group) => sum + group.assignmentCount, 0),
    drafts: draftRows.length,
    open: openRows.length,
    overdue: overdueRows.length,
    paid: paidRows.length,
  };

  const handleCreated = useCallback(
    (invoice: CreatedInvoiceDraft, companyName: string) => {
      setHighlightId(invoice.id);
      setActiveTab('drafts');
      setFeedback(t('invoicing.uninvoiced.createdFeedback', { company: companyName }));
      void load();
    },
    [load, t],
  );

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <Receipt className="h-6 w-6 shrink-0 text-slate-700" aria-hidden />
          <div className="min-w-0">
            <h1 className={FLEET_PAGE_TITLE}>{t('invoicing.title')}</h1>
            <p className="text-[13px] text-slate-600">{t('invoicing.subtitle')}</p>
          </div>
        </div>
        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/billing-profile">
              <Settings className="mr-2 h-4 w-4" aria-hidden />
              {t('invoicing.billingProfile.title')}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/invoicing/invoices/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              {t('invoicing.new.title')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('invoicing.loadErrorTitle')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => void load()}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('invoicing.kpi.uninvoiced')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                {formatFleetCurrency(centsToEuro(kpis.uninvoicedCents))}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">{t('invoicing.kpi.uninvoicedHint')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('invoicing.kpi.openReceivables')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                {formatFleetCurrency(centsToEuro(kpis.openCents))}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">
                {t('invoicing.kpi.openReceivablesHint')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('invoicing.kpi.overdue')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  'text-2xl font-bold',
                  kpis.overdueCents > 0 ? 'text-red-700' : 'text-slate-900',
                )}
              >
                {formatFleetCurrency(centsToEuro(kpis.overdueCents))}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">{t('invoicing.kpi.overdueHint')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {t('invoicing.kpi.dso')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                {kpis.dsoDays === null
                  ? t('invoicing.kpi.dsoUnavailable')
                  : t('invoicing.kpi.dsoDays', { days: kpis.dsoDays })}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">{t('invoicing.kpi.dsoHint')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {feedback ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          {feedback}
        </p>
      ) : null}

      <div className={cn(FLEET_LIST_CARD, 'rounded-xl bg-white')}>
        <div className={cn(FLEET_TAB_BAR, 'px-4')}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                setFeedback(null);
              }}
              className={cn(
                FLEET_TAB_ITEM,
                'inline-flex items-center gap-2',
                activeTab === tab
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <span>{t(`invoicing.tab.${tab}`)}</span>
              <span
                className={cn(
                  'inline-flex min-w-[1.375rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none',
                  activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {tabCounts[tab]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('invoicing.filters.searchPlaceholder')}
              aria-label={t('invoicing.filters.searchPlaceholder')}
              className="h-9 pl-9"
            />
          </div>
          <select
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
            aria-label={t('invoicing.filters.company')}
            className={cn(FLEET_FILTER_SELECT, 'rounded-md border border-slate-200 px-2')}
          >
            <option value="">{t('invoicing.filters.allCompanies')}</option>
            {companyOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        {activeTab === 'uninvoiced' ? (
          <UninvoicedPanel groups={filteredUninvoiced} loading={loading} onCreated={handleCreated} />
        ) : null}

        {activeTab === 'drafts' ? (
          <InvoiceTable
            rows={draftRows}
            loading={loading}
            highlightId={highlightId}
            emptyIcon={FileText}
            emptyTitle={t('invoicing.empty.draftsTitle')}
            emptySubtitle={t('invoicing.empty.draftsDescription')}
          />
        ) : null}

        {activeTab === 'open' ? (
          <InvoiceTable
            rows={openRows}
            loading={loading}
            emptyIcon={Send}
            emptyTitle={t('invoicing.empty.openTitle')}
            emptySubtitle={t('invoicing.empty.openDescription')}
          />
        ) : null}

        {activeTab === 'overdue' ? (
          <InvoiceTable
            rows={overdueRows}
            loading={loading}
            emptyIcon={AlertTriangle}
            emptyTitle={t('invoicing.empty.overdueTitle')}
            emptySubtitle={t('invoicing.empty.overdueDescription')}
          />
        ) : null}

        {activeTab === 'paid' ? (
          <InvoiceTable
            rows={paidRows}
            loading={loading}
            emptyIcon={CheckCircle2}
            emptyTitle={t('invoicing.empty.paidTitle')}
            emptySubtitle={t('invoicing.empty.paidDescription')}
          />
        ) : null}
      </div>

      <OpenOverdueAssignmentsCard />
    </div>
  );
}
