'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { auditApi, type PaginatedAuditLogs } from '@/lib/api';
import { downloadBlob } from '@/lib/download-blob';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FLEET_LIST_CARD,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { cn, formatDate } from '@/lib/utils';

export default function AuditPage() {
  const { t } = useTranslation();
  const [result, setResult] = useState<PaginatedAuditLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.listPage({
        action: action || undefined,
        entityType: entityType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 50,
      });
      setResult(data);
    } catch {
      setError(t('audit.loadError'));
    } finally {
      setLoading(false);
    }
  }, [action, entityType, dateFrom, dateTo, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await auditApi.exportCsv({
        action: action || undefined,
        entityType: entityType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `audit-logs-${stamp}.csv`);
    } catch {
      setError(t('audit.exportError'));
    } finally {
      setExporting(false);
    }
  }

  const totalPages = result?.pages ?? 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('audit.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('audit.subtitle')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t('audit.exportCsv')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('audit.filters')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder={t('audit.filterAction')}
            value={action}
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
          />
          <Input
            placeholder={t('audit.filterEntity')}
            value={entityType}
            onChange={(event) => {
              setPage(1);
              setEntityType(event.target.value);
            }}
          />
          <Input type="date" value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} />
          <Input type="date" value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} />
        </CardContent>
      </Card>

      <Card className={FLEET_LIST_CARD}>
        <CardContent className="p-0">
          {error ? (
            <p className="px-6 py-4 text-sm text-rose-600">{error}</p>
          ) : loading ? (
            <p className="flex items-center gap-2 px-6 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </p>
          ) : !result || result.data.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500">{t('audit.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('audit.colWhen')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('audit.colActor')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('audit.colAction')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('audit.colEntity')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('audit.colSummary')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {result.data.map((row) => (
                    <TableRow key={row.id} className={FLEET_TABLE_ROW}>
                      <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'whitespace-nowrap')}>
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <div>{row.actorUser?.fullName ?? '—'}</div>
                        <div className="text-[11px] text-gray-500">{row.actorUser?.email ?? ''}</div>
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL, 'font-mono')}>{row.action}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>
                        {row.entityType}
                        {row.entityId ? ` / ${row.entityId.slice(0, 8)}…` : ''}
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'max-w-xs truncate')}>
                        {row.summary ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {result && result.total > 0 ? (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {t('audit.pageInfo', {
              page: result.page,
              pages: totalPages,
              total: result.total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t('audit.prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('audit.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
