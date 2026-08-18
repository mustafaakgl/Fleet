'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fuelReconciliationApi } from '@/lib/api';
import { formatFleetCurrency } from '@/lib/locale-format';
import {
  FLEET_FILTER_SELECT,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
} from '@/lib/fleet-table';
import { riskLabelKey, riskTone, signalLabelKey } from '@/lib/fuel-reconciliation-view';
import type { FuelReconciliationQueueResponse, FuelReconciliationRiskLevel } from '@/lib/types';
import { FuelReceiptReviewDrawer } from './FuelReceiptReviewDrawer';

const RISK_FILTERS: Array<FuelReconciliationRiskLevel | 'all'> = [
  'all',
  'high_attention',
  'review_required',
  'normal',
  'insufficient_data',
];

const TONE_BADGE = {
  positive: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline',
} as const;

/**
 * Telematik mutabakati kuyrugu.
 *
 * Varsayilan siralama RISK: tek bir "yuksek dikkat" kaydi, gunluk normal
 * kayitlarin altinda kaybolmamali. Sayfalama ve filtre SUNUCUDA — sayfalanmis
 * bir listeyi istemcide filtrelemek "3 kayit" yerine "bu sayfadaki 3 kayit"
 * demek olurdu.
 *
 * Rol kontrolu sunucuda (`FINANCIAL_ROLES`); bilesenin gizlenmesi guvenlik
 * degil arayuz nezaketidir.
 */
export function FuelReconciliationQueue({ vehicleId }: { vehicleId?: string } = {}) {
  const { t, i18n } = useTranslation();

  const [risk, setRisk] = useState<FuelReconciliationRiskLevel | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FuelReconciliationQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);

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
      const response = await fuelReconciliationApi.list(
        {
          riskLevel: risk === 'all' ? undefined : risk,
          reviewState: openOnly ? 'open' : undefined,
          vehicleId,
          page,
        },
        controller.signal,
      );
      if (seq !== seqRef.current) return;
      setData(response);
    } catch {
      if (seq !== seqRef.current || controller.signal.aborted) return;
      setErrorKey('costs.fuelReconciliation.loadFailed');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [risk, openOnly, vehicleId, page]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Filtre degisince sayfa 1'e doner: 5. sayfada bos liste gostermeyelim.
  useEffect(() => {
    setPage(1);
  }, [risk, openOnly, vehicleId]);

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3" data-testid="reconciliation-queue">
      <div className="flex flex-wrap items-center gap-3">
        {/* Kontrol bekleyen sayisi — RAKAM olarak, yalnizca renk degil. */}
        <span className="text-sm" data-testid="reconciliation-open-count">
          {t('costs.fuelReconciliation.openCount', { count: data?.summary.openCount ?? 0 })}
        </span>
        <span className="text-sm text-muted-foreground" data-testid="reconciliation-high-count">
          {t('costs.fuelReconciliation.highCount', {
            count: data?.summary.highAttentionCount ?? 0,
          })}
        </span>

        <select
          aria-label={t('costs.fuelReconciliation.riskFilter')}
          className={FLEET_FILTER_SELECT}
          value={risk}
          onChange={(event) =>
            setRisk(event.target.value as FuelReconciliationRiskLevel | 'all')
          }
        >
          {RISK_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'all'
                ? t('costs.fuelReconciliation.risk.all')
                : t(riskLabelKey(value))}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
          />
          {t('costs.fuelReconciliation.openOnly')}
        </label>
      </div>

      {errorKey ? <p className="text-sm text-red-600">{t(errorKey)}</p> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t('costs.fuelReconciliation.emptyTitle')}
          subtitle={t('costs.fuelReconciliation.emptyBody')}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('costs.fuelReconciliation.vehicle')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('costs.fuelReconciliation.date')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('costs.fuelReconciliation.amount')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('costs.fuelReconciliation.riskColumn')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('costs.fuelReconciliation.signalsColumn')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD} />
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="reconciliation-row">
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                    {/* Araca dogrudan bag: kapasite gibi eksik bir ayari
                        duzeltmek icin ekran degistirmek gerekmesin. */}
                    <Link className="underline underline-offset-2" href={`/vehicles/${row.vehicle.id}`}>
                      {row.vehicle.plateNumber}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {new Date(row.purchasedAt).toLocaleDateString(i18n.language)}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {row.fuelGrossAmount === null
                      ? '—'
                      : formatFleetCurrency(row.fuelGrossAmount, row.currency)}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {/* Renk TEK BASINA anlam tasimiyor: rozetin metni de var. */}
                    <Badge variant={TONE_BADGE[riskTone(row.riskLevel)]}>
                      {t(riskLabelKey(row.riskLevel))}
                    </Badge>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {row.signalCodes.length === 0
                      ? '—'
                      : row.signalCodes.map((code) => t(signalLabelKey(code))).join(' · ')}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {/* Ilgili FISE bag: ayni cekmece, ayni panel. */}
                    <Button type="button" size="sm" onClick={() => setOpenReceiptId(row.fuelEntryId)}>
                      {t('costs.fuelReconciliation.openReceipt')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t('common.previous')}
          </Button>
          <span>
            {data.page} / {data.totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= data.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      ) : null}

      {openReceiptId ? (
        <FuelReceiptReviewDrawer
          receiptId={openReceiptId}
          onClose={() => setOpenReceiptId(null)}
          onReviewed={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
