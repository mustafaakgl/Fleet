'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleAlert, CreditCard, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fleetFuelCardApi, getApiErrorMessage } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import type {
  FuelCardImportBatchSummary,
  FuelCardTransactionStatus,
  FuelCardTransactionSummary,
} from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { formatFleetDateTime } from '@/lib/locale-format';

const STATUS_VARIANT: Record<FuelCardTransactionStatus, 'default' | 'secondary' | 'warning' | 'outline'> = {
  imported: 'secondary',
  matched: 'default',
  disputed: 'warning',
  ignored: 'outline',
};

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function liters(value: number | null): string {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value)} L`;
}

function rowsLabel(batch: FuelCardImportBatchSummary): string {
  return `${batch.totalRows} / ${batch.matchedRows} / ${batch.unmatchedRows}`;
}

function matchRate(batch: FuelCardImportBatchSummary): string {
  if (batch.totalRows === 0) return '—';
  return `${Math.round((batch.matchedRows / batch.totalRows) * 100)}%`;
}

export default function FuelCardReconciliationPage() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<FuelCardImportBatchSummary[]>([]);
  const [transactions, setTransactions] = useState<FuelCardTransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<FuelCardTransactionStatus | 'all'>('all');
  const [batchId, setBatchId] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const batchFilter = batchId === 'all' ? undefined : batchId;
      const statusFilter = status === 'all' ? undefined : status;
      const [batchData, transactionData] = await Promise.all([
        fleetFuelCardApi.listImportBatches(),
        fleetFuelCardApi.listTransactions({ batchId: batchFilter, status: statusFilter }),
      ]);
      setBatches(batchData);
      setTransactions(transactionData);
    } catch (e) {
      setError(getApiErrorMessage(e, t('fuelCardReconciliation.loadError', 'Reconciliation data could not be loaded.')));
      setBatches([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [batchId, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const matched = transactions.filter((row) => row.status === 'matched').length;
    const disputed = transactions.filter((row) => row.status === 'disputed').length;
    const ignored = transactions.filter((row) => row.status === 'ignored').length;
    const unmatched = transactions.filter((row) => row.status === 'imported').length;
    return { matched, disputed, ignored, unmatched };
  }, [transactions]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex min-w-0 items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div className="min-w-0">
            <h1 className={FLEET_PAGE_TITLE}>{t('fuelCardReconciliation.title', 'Fuel card reconciliation')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('fuelCardReconciliation.subtitle', 'Imported card statements matched against fuel receipts.')}
            </p>
            <p className="text-xs text-amber-700">
              {t('fuelCardReconciliation.seededDemo', 'Demo data is loaded so you can inspect the layout.')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/fleet-analytics/fuel">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('fuelCardReconciliation.back', 'Back to fuel analytics')}
            </Link>
          </Button>
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('fuelCardReconciliation.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          [t('fuelCardReconciliation.summary.batches', 'Import batches'), batches.length],
          [t('fuelCardReconciliation.summary.transactions', 'Transactions'), transactions.length],
          [t('fuelCardReconciliation.summary.matched', 'Matched'), summary.matched],
          [t('fuelCardReconciliation.summary.disputed', 'Disputed'), summary.disputed],
          [t('fuelCardReconciliation.summary.unmatched', 'Unmatched'), summary.unmatched],
          [t('fuelCardReconciliation.summary.ignored', 'Ignored'), summary.ignored],
        ].map(([label, value]) => (
          <Card key={String(label)} className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{value as number}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={CircleAlert}
          title={t('common.error', 'Fehler')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => void load()}
        />
      ) : null}

      {!error && loading ? <p className="text-sm text-muted-foreground">{t('common.loading', 'Laden…')}</p> : null}

      {!error && !loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>{t('fuelCardReconciliation.batchTable', 'Import batches')}</CardTitle>
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-[13px]"
                value={batchId}
                onChange={(event) => setBatchId(event.target.value)}
              >
                <option value="all">{t('fuelCardReconciliation.allBatches', 'All batches')}</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.sourceFileName}
                  </option>
                ))}
              </select>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {batches.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {t('fuelCardReconciliation.noBatches', 'No card import batches yet.')}
                </div>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.file', 'File')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.importedAt', 'Imported at')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.rows', 'Rows')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.matchRate', 'Match rate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {batches.map((batch) => (
                      <TableRow key={batch.id} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <div className="font-medium">{batch.sourceFileName}</div>
                          <div className="text-xs font-normal text-muted-foreground">{batch.sourceStoredPath ?? '—'}</div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatDate(batch.importedAt)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{rowsLabel(batch)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{matchRate(batch)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>{t('fuelCardReconciliation.transactionTable', 'Transactions')}</CardTitle>
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-[13px]"
                value={status}
                onChange={(event) => setStatus(event.target.value as FuelCardTransactionStatus | 'all')}
              >
                <option value="all">{t('fuelCardReconciliation.allStatuses', 'All statuses')}</option>
                <option value="imported">{t('fuelCardReconciliation.status.imported', 'Imported')}</option>
                <option value="matched">{t('fuelCardReconciliation.status.matched', 'Matched')}</option>
                <option value="disputed">{t('fuelCardReconciliation.status.disputed', 'Disputed')}</option>
                <option value="ignored">{t('fuelCardReconciliation.status.ignored', 'Ignored')}</option>
              </select>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {transactions.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {t('fuelCardReconciliation.noTransactions', 'No transactions match the selected filters.')}
                </div>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.merchant', 'Merchant')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.vehicle', 'Vehicle')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.amount', 'Amount')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('fuelCardReconciliation.col.status', 'Status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <div className="font-medium">{transaction.merchantName}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {formatFleetDateTime(transaction.transactionAt)}
                          </div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>
                          <div>{transaction.plateNumber ?? transaction.vehicleId ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{transaction.driverName ?? '—'}</div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <div>{money(transaction.amount, transaction.currency)}</div>
                          <div className="text-xs text-muted-foreground">{liters(transaction.liters)}</div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Badge variant={STATUS_VARIANT[transaction.status]}>
                            {t(`fuelCardReconciliation.status.${transaction.status}`, transaction.status)}
                          </Badge>
                          <div className="mt-2 text-xs text-muted-foreground">{transaction.matchNote ?? '—'}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
