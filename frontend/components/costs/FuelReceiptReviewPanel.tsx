'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fuelReceiptReviewApi } from '@/lib/api';
import { formatFleetCurrency } from '@/lib/locale-format';
import {
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
} from '@/lib/fleet-table';
import type { FuelEntryWorkflowStatus, FuelReceiptQueueResponse } from '@/lib/types';
import { FuelReceiptReviewDrawer } from './FuelReceiptReviewDrawer';

const TABS: Array<{ key: 'pending' | 'approved' | 'rejected' | 'all'; status?: FuelEntryWorkflowStatus }> = [
  { key: 'pending', status: 'submitted' },
  { key: 'approved', status: 'approved' },
  { key: 'rejected', status: 'rejected' },
  { key: 'all', status: undefined },
];

/**
 * Muhasebenin yakit fisi inceleme kuyrugu.
 *
 * Varsayilan gorunum BEKLEYENLER ve en uzun bekleyen once: eski fisler
 * listenin dibinde unutulmamali. Sayfalama SUNUCU tarafinda — buyuk filolarda
 * tum kuyrugu cekmek hem yavas hem gereksiz.
 *
 * Rol kontrolu sunucuda (`FINANCIAL_ROLES`); bu bilesenin gizlenmesi guvenlik
 * degil, yalnizca arayuz nezaketidir.
 */
export function FuelReceiptReviewPanel() {
  const { t, i18n } = useTranslation();

  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending');
  const [data, setData] = useState<FuelReceiptQueueResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** Eski cevap yenisinin uzerine YAZMAMALI. */
  const seqRef = useRef(0);

  const load = useCallback(
    async (targetPage: number, targetTab: (typeof TABS)[number]['key']) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = seqRef.current + 1;
      seqRef.current = seq;

      setLoading(true);
      setErrorKey(null);
      try {
        const response = await fuelReceiptReviewApi.list(
          { status: TABS.find((entry) => entry.key === targetTab)?.status, page: targetPage },
          controller.signal,
        );
        if (seq !== seqRef.current) return;
        setData(response);
      } catch {
        if (seq !== seqRef.current || controller.signal.aborted) return;
        setErrorKey('costs.fuelReceipts.loadFailed');
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(page, tab);
    return () => abortRef.current?.abort();
  }, [load, page, tab]);

  const rows = data?.rows ?? [];

  /** Onay/ret sonrasi liste TAZELENMELI: kapanan fis kuyrukta kalmamali. */
  const handleReviewed = useCallback(() => {
    setOpenId(null);
    void load(page, tab);
  }, [load, page, tab]);

  return (
    <div className="space-y-4">
      {/* Kuyrugun iki rakami: kac tane bekliyor ve en eskisi ne kadardir. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('costs.fuelReceipts.pendingCount')}
            </p>
            <p className="text-2xl font-bold" data-testid="pending-count">
              {data?.summary.pendingCount ?? '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('costs.fuelReceipts.oldestWaiting')}
            </p>
            <p className="text-2xl font-bold">
              {data?.summary.oldestWaitingDays === null || data?.summary.oldestWaitingDays === undefined
                ? '—'
                : t('costs.fuelReceipts.days', { count: data.summary.oldestWaitingDays })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <Button
            key={entry.key}
            type="button"
            size="sm"
            variant={entry.key === tab ? 'default' : 'outline'}
            aria-pressed={entry.key === tab}
            onClick={() => {
              setTab(entry.key);
              setPage(1);
            }}
          >
            {t(`costs.fuelReceipts.tabs.${entry.key}`)}
          </Button>
        ))}
      </div>

      {errorKey ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t(errorKey)}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('costs.fuelReceipts.emptyTitle')}
          subtitle={t('costs.fuelReceipts.emptyBody')}
        />
      ) : (
        <>
          {/* Genis tablo kendi kutusunda kayar; sayfa yatay kaymaz. */}
          <div className="overflow-x-auto">
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.station')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.liters')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.amount')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.waiting')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('costs.fuelReceipts.flags')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD} />
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {rows.map((row) => (
                  <TableRow key={row.id} data-testid="receipt-row">
                    <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{row.vehicle.plateNumber}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{row.driver.name}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{row.stationName ?? '—'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {new Date(row.purchasedAt).toLocaleDateString(i18n.language)}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{row.liters ?? '—'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {row.fuelGrossAmount === null
                        ? '—'
                        : formatFleetCurrency(row.fuelGrossAmount, row.currency)}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {row.waitingDays === null
                        ? '—'
                        : t('costs.fuelReceipts.days', { count: row.waitingDays })}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <div className="flex flex-wrap gap-1">
                        {row.compatibilityMismatch ? (
                          <Badge variant="destructive" title={t('costs.fuelReceipts.flagMismatch')}>
                            {t('costs.fuelReceipts.flagMismatchShort')}
                          </Badge>
                        ) : null}
                        {row.duplicateSuspected ? (
                          <Badge variant="outline" title={t('costs.fuelReceipts.flagDuplicate')}>
                            <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                            {t('costs.fuelReceipts.flagDuplicateShort')}
                          </Badge>
                        ) : null}
                        {row.ocrProblem ? (
                          <Badge variant="outline" title={t('costs.fuelReceipts.flagOcr')}>
                            {t('costs.fuelReceipts.flagOcrShort')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <Button type="button" size="sm" onClick={() => setOpenId(row.id)}>
                        {t('costs.fuelReceipts.review')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data && data.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {t('costs.fuelReceipts.pageOf', { page: data.page, pages: data.totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('common.previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {openId ? (
        <FuelReceiptReviewDrawer
          receiptId={openId}
          onClose={() => setOpenId(null)}
          onReviewed={handleReviewed}
        />
      ) : null}
    </div>
  );
}
