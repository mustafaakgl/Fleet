'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Fuel, Landmark, Receipt, Scale, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { financeApi } from '@/lib/api';
import {
  amountKind,
  FINANCE_PERIODS,
  financeErrorKey,
  hasMargin,
  isTruncated,
  type FinancePeriod,
} from '@/lib/finance-view';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import { formatFleetCurrency, formatFleetDate } from '@/lib/locale-format';
import { canViewFinancials } from '@/lib/permissions';
import { getUser } from '@/lib/auth';
import type {
  FinanceAmount,
  FinanceFineItem,
  FinanceFuelItem,
  FinanceServiceItem,
  FinanceSummaryResponse,
} from '@/lib/types';
import { ServiceRecordReviewDrawer } from './ServiceRecordReviewDrawer';

/**
 * FINANCE MERKEZI (Faz 18C) — TEK ekran.
 *
 * Alti ayri sayfa ACILMADI ve bu bilincli: muhasebenin gunluk sorusu "neyi
 * onaylamam gerekiyor ve toplamlar nerede duruyor" — bu soru tek bir ekranda
 * cevaplanabiliyorsa altiya bolmek her sabah alti sekme actirir.
 *
 * TAHMIN ile GERCEK ASLA BIRLESMEZ: iki ayri kart, iki ayri rozet, hicbir
 * yerde toplanmiyorlar. `0` ile "veri yok" da ayri: `count === 0` olan bir
 * blok `0,00` DEGIL "veri yok" yaziyor, cunku `0,00` "bu donemde hic masraf
 * olmadi" diye okunur.
 *
 * VERI TEK UCTAN: `/finance/summary`. Yedi blok ayni donemi ve ayni tanima
 * kurallarini paylasmak zorunda; yedi ayri istek arada donem kaydirirdi.
 */
export function FinanceOverview() {
  const { t } = useTranslation();

  const [months, setMonths] = useState<FinancePeriod>(6);
  const [data, setData] = useState<FinanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<FinanceServiceItem | null>(null);

  /**
   * ROL KAPISI ISTEMCIDE DE VAR AMA ASIL KAPI SUNUCUDA.
   *
   * `/finance/summary` `@Roles(...FINANCIAL_ROLES)` ile korunuyor; yetkisiz
   * rol veriyi HIC ALMIYOR. Buradaki kontrol yalnizca yanlis role bos bir
   * ekran yerine anlasilir bir mesaj gostermek icin — gizleme degil.
   */
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    const user = getUser();
    setAllowed(user ? canViewFinancials(user.role) : false);
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  /** Eski cevap yenisinin uzerine YAZMAMALI. */
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = seqRef.current + 1;
    seqRef.current = seq;

    setLoading(true);
    setErrorKey(null);
    try {
      const response = await financeApi.getSummary({ months }, controller.signal);
      if (seq !== seqRef.current) return;
      setData(response);
    } catch (caught) {
      if (seq !== seqRef.current || controller.signal.aborted) return;
      setErrorKey(financeErrorKey(extractApiErrorCode(caught)));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    if (allowed !== true) return;
    void load();
    return () => abortRef.current?.abort();
  }, [allowed, load]);

  if (allowed === false) {
    return (
      <EmptyState
        icon={Landmark}
        title={t('finance.forbiddenTitle')}
        subtitle={t('finance.forbiddenBody')}
      />
    );
  }

  const currency = data?.baseCurrency ?? 'EUR';

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="finance-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('finance.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('finance.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('finance.period')}>
            {FINANCE_PERIODS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={option === months ? 'default' : 'outline'}
                aria-pressed={option === months}
                onClick={() => setMonths(option)}
              >
                {t('finance.months', { count: option })}
              </Button>
            ))}
          </div>
          {/* MEVCUT ekrana yonlendirme: yeni bir fatura sayfasi ACILMADI. */}
          <Button asChild variant="outline" size="sm">
            <Link href="/invoicing">
              <Receipt className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('finance.openInvoicing')}
            </Link>
          </Button>
        </div>
      </div>

      {errorKey ? (
        <EmptyState
          icon={Landmark}
          title={t('finance.loadErrorTitle')}
          subtitle={t(errorKey)}
          actionLabel={t('common.retry')}
          onAction={() => {
            void load();
          }}
        />
      ) : null}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="finance-loading">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : null}

      {data ? (
        <>
          <p className="text-sm text-slate-500">
            {t('finance.periodInfo', {
              from: formatFleetDate(data.period.from),
              to: formatFleetDate(data.period.to),
            })}
          </p>

          {/* --- Ozet: TAHMIN ve GERCEK ayri kartlarda --- */}
          <section
            aria-label={t('finance.summaryTitle')}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <SummaryCard
              testId="finance-kpi-actualRevenue"
              label={t('finance.kpi.actualRevenue')}
              entry={data.revenue.actual}
              currency={currency}
              basis={t('finance.basis.actual')}
              hint={data.revenue.actual === null ? t('finance.kpi.noInvoiceHint') : undefined}
            />
            <SummaryCard
              testId="finance-kpi-estimatedRevenue"
              label={t('finance.kpi.estimatedRevenue')}
              entry={data.revenue.estimated}
              currency={currency}
              basis={t('finance.basis.estimated')}
              hint={t('finance.kpi.estimatedHint')}
            />
            <SummaryCard
              testId="finance-kpi-approvedCost"
              label={t('finance.kpi.approvedCost')}
              entry={data.cost.total}
              currency={currency}
              basis={t('finance.basis.actual')}
              hint={t('finance.kpi.approvedCostHint')}
            />
            <Card data-testid="finance-kpi-margin">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('finance.kpi.margin')}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {hasMargin(data) ? (
                    formatFleetCurrency(Number(data.margin), currency)
                  ) : (
                    <span className="text-base font-medium text-muted-foreground">
                      {t('finance.noData')}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('finance.basis.actual')}
                </p>
                {!hasMargin(data) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('finance.kpi.marginHint')}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>

          {/* --- Onayli gider kirilimi --- */}
          <section aria-label={t('finance.costBreakdownTitle')}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('finance.costBreakdownTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <Figure
                  label={t('finance.cost.fuel')}
                  entry={data.cost.fuel}
                  currency={currency}
                />
                <Figure
                  label={t('finance.cost.service')}
                  entry={data.cost.service}
                  currency={currency}
                />
                <Figure
                  label={t('finance.cost.fines')}
                  entry={data.cost.fines}
                  currency={currency}
                />
              </CardContent>
            </Card>
          </section>

          {/* --- Karar bekleyen servis kayitlari --- */}
          <ListSection
            testId="finance-pending-service"
            icon={Wrench}
            title={t('finance.pendingService.title')}
            note={t('finance.pendingService.note')}
            block={data.pendingServiceRecords}
            currency={currency}
            emptyLabel={t('finance.pendingService.empty')}
            columns={[
              t('finance.column.date'),
              t('finance.column.vehicle'),
              t('finance.column.subject'),
              t('finance.column.amount'),
              '',
            ]}
            renderRow={(item: FinanceServiceItem) => ({
              key: item.id,
              cells: [
                formatFleetDate(item.date),
                item.vehiclePlate,
                `${item.serviceType} · ${item.repairCompany}`,
                formatFleetCurrency(Number(item.amount), item.currency),
              ],
              action: (
                <Button type="button" size="sm" onClick={() => setReviewItem(item)}>
                  {t('finance.pendingService.review')}
                </Button>
              ),
            })}
          />

          {/* --- Yakit fisleri: mevcut fis detayina baglanti --- */}
          <ListSection
            testId="finance-fuel-receipts"
            icon={Fuel}
            title={t('finance.fuelReceipts.title')}
            note={t('finance.fuelReceipts.note')}
            block={data.fuelReceipts}
            currency={currency}
            emptyLabel={t('finance.fuelReceipts.empty')}
            columns={[
              t('finance.column.date'),
              t('finance.column.vehicle'),
              t('finance.column.subject'),
              t('finance.column.amount'),
              '',
            ]}
            renderRow={(item: FinanceFuelItem) => ({
              key: item.id,
              cells: [
                formatFleetDate(item.enteredAt),
                item.vehiclePlate,
                item.stationName ?? t('finance.noData'),
                item.amount === null
                  ? t('finance.noData')
                  : formatFleetCurrency(Number(item.amount), item.currency),
              ],
              action: (
                <Button asChild size="sm" variant="outline">
                  {/* MEVCUT fis detayi (cekmece) aciliyor — yeni bir gider
                      detay sayfasi ACILMADI. */}
                  <Link
                    href={`/costs?tab=receipts&receipt=${encodeURIComponent(item.id)}`}
                  >
                    {t('finance.fuelReceipts.open')}
                  </Link>
                </Button>
              ),
            })}
          />

          {/* --- Ihtilafli cezalar: AYRI bolum --- */}
          <ListSection
            testId="finance-disputed-fines"
            icon={Scale}
            title={t('finance.disputedFines.title')}
            note={t('finance.disputedFines.note')}
            block={data.disputedFines}
            currency={currency}
            emptyLabel={t('finance.disputedFines.empty')}
            columns={[
              t('finance.column.date'),
              t('finance.column.vehicle'),
              t('finance.column.subject'),
              t('finance.column.amount'),
              '',
            ]}
            renderRow={(item: FinanceFineItem) => ({
              key: item.id,
              cells: [
                formatFleetDate(item.violationAt),
                item.vehiclePlate,
                item.violationType,
                item.amount === null
                  ? t('finance.noData')
                  : formatFleetCurrency(Number(item.amount), item.currency),
              ],
              action: (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/fines/${item.id}`}>{t('finance.disputedFines.open')}</Link>
                </Button>
              ),
            })}
          />

          {/* --- Donusturulmemis para birimleri --- */}
          <section aria-label={t('finance.unconverted.title')}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('finance.unconverted.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.unconvertedByCurrency.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('finance.unconverted.empty')}
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-muted-foreground">
                      {t('finance.unconverted.note', { base: currency })}
                    </p>
                    <ul className="space-y-1 text-sm" data-testid="finance-unconverted">
                      {data.unconvertedByCurrency.map((entry) => (
                        <li
                          key={entry.currency}
                          className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-1"
                        >
                          <span>{entry.currency}</span>
                          <span className="tabular-nums">
                            {formatFleetCurrency(Number(entry.amount), entry.currency)}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t('finance.unconverted.count', { count: entry.entryCount })}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}

      {reviewItem ? (
        <ServiceRecordReviewDrawer
          item={reviewItem}
          baseCurrency={currency}
          onClose={() => setReviewItem(null)}
          onReviewed={() => {
            setReviewItem(null);
            // Karardan sonra TEK kaynak yeniden okunuyor: toplamlar ile kuyruk
            // istemcide ayri ayri guncellenirse birbirini tutmaz.
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Ozet karti.
 *
 * `count === 0` ise `0,00` DEGIL "veri yok" yaziyor. Ikisini ayni gostermek,
 * hicbir fatura kesilmemis bir donemi "sifir ciro" diye okutur.
 */
function SummaryCard({
  testId,
  label,
  entry,
  currency,
  basis,
  hint,
}: {
  testId: string;
  label: string;
  entry: FinanceAmount | null;
  currency: string;
  basis: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const kind = amountKind(entry);

  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {kind === 'value' && entry ? (
            formatFleetCurrency(Number(entry.amount), currency)
          ) : (
            <span className="text-base font-medium text-muted-foreground">
              {t('finance.noData')}
            </span>
          )}
        </p>
        {/* Sinif METIN olarak duruyor: renk tek basina anlam tasimaz. */}
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{basis}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  entry,
  currency,
}: {
  label: string;
  entry: FinanceAmount;
  currency: string;
}) {
  const { t } = useTranslation();
  const kind = amountKind(entry);
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {kind === 'value' ? (
          formatFleetCurrency(Number(entry.amount), currency)
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{t('finance.noData')}</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('finance.recordCount', { count: entry.count })}
      </p>
    </div>
  );
}

interface RenderedRow {
  key: string;
  cells: string[];
  action: React.ReactNode;
}

/**
 * Liste bolumu — MOBILDE KART, MASAUSTUNDE TABLO.
 *
 * Tablo `overflow-x-auto` bir kabin icinde: genis icerik KENDI kutusunda
 * kayiyor, sayfa govdesi yatay kaymiyor. Mobilde tablo hic render edilmiyor;
 * dar ekranda yedi sutunlu bir tabloyu kaydirtmak, okunmayan bir tablo
 * gostermekle ayni sey.
 */
function ListSection<T>({
  testId,
  icon: Icon,
  title,
  note,
  block,
  currency,
  emptyLabel,
  columns,
  renderRow,
}: {
  testId: string;
  icon: typeof Wrench;
  title: string;
  note: string;
  block: { totalAmount: string; totalCount: number; items: T[] };
  currency: string;
  emptyLabel: string;
  columns: string[];
  renderRow: (item: T) => RenderedRow;
}) {
  const { t } = useTranslation();
  const rows = block.items.map(renderRow);

  return (
    <section aria-label={title} data-testid={testId}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {title}
            </CardTitle>
            <p className="text-sm tabular-nums">
              {block.totalCount === 0 ? (
                <span className="text-muted-foreground">{t('finance.noData')}</span>
              ) : (
                <>
                  <span className="font-semibold">
                    {formatFleetCurrency(Number(block.totalAmount), currency)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('finance.recordCount', { count: block.totalCount })}
                  </span>
                </>
              )}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{note}</p>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <>
              {/* Mobil: kart listesi */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {rows.map((row) => (
                  <li key={row.key} className="space-y-1 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{row.cells[1]}</span>
                      <span className="tabular-nums">{row.cells[3]}</span>
                    </div>
                    <p className="break-words text-sm text-muted-foreground">{row.cells[2]}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{row.cells[0]}</span>
                      {row.action}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Masaustu: tablo. Kaydirma TABLONUN kendi kutusunda. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-muted-foreground">
                      {columns.map((column, index) => (
                        <th
                          key={column || `col-${index}`}
                          scope="col"
                          className={`px-3 py-2 ${index === 3 ? 'text-right' : ''}`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-b border-slate-100">
                        <td className="whitespace-nowrap px-3 py-2">{row.cells[0]}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{row.cells[1]}</td>
                        <td className="px-3 py-2">{row.cells[2]}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {row.cells[3]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Kirpma SESSIZ DEGIL: kac kayittan kaci gosteriliyor yaziyor. */}
              {isTruncated(block) ? (
                <p className="border-t border-slate-100 p-3 text-xs text-muted-foreground">
                  {t('finance.truncated', {
                    shown: block.items.length,
                    total: block.totalCount,
                  })}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
