'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InvoiceStatusBadge } from '@/components/invoicing/InvoiceStatusBadge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { formatFleetCurrency, formatFleetDate } from '@/lib/locale-format';
import type { OutgoingInvoiceListItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

function centsToEuro(cents: number): number {
  return cents / 100;
}

export function InvoiceTable({
  rows,
  loading,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  highlightId,
}: {
  rows: OutgoingInvoiceListItem[];
  loading: boolean;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptySubtitle: string;
  highlightId?: string | null;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [rows]);

  if (loading) {
    return <p className="p-4 text-[13px] text-slate-500">{t('common.loading')}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(rows.length, (currentPage + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <Table className={FLEET_TABLE}>
          <TableHeader>
            <TableRow className={FLEET_TABLE_HEADER_ROW}>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.number')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.company')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.invoiceDate')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>
                {t('invoicing.table.servicePeriod')}
              </TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.dueDate')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.status')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.gross')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.table.openAmount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={FLEET_TABLE_BODY}>
            {pageRows.map((invoice) => {
              const openCents = Math.max(0, invoice.grossCents - invoice.paidCents);

              return (
                <TableRow
                  key={invoice.id}
                  className={cn(
                    FLEET_TABLE_ROW,
                    invoice.id === highlightId && 'bg-blue-50 ring-1 ring-inset ring-blue-300',
                  )}
                >
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                    {invoice.number ?? t('invoicing.table.draftNumber')}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>{invoice.company.name}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {formatFleetDate(invoice.invoiceDate)}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL_MUTED}>
                    {`${formatFleetDate(invoice.servicePeriodStart)} – ${formatFleetDate(
                      invoice.servicePeriodEnd,
                    )}`}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL_MUTED}>
                    {invoice.dueDate
                      ? formatFleetDate(invoice.dueDate)
                      : t('invoicing.table.noDueDate')}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {formatFleetCurrency(centsToEuro(invoice.grossCents))}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {formatFleetCurrency(centsToEuro(openCents))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-3 py-2 text-[13px] text-slate-600">
        <span>
          {t('invoicing.pagination', { from: rangeStart, to: rangeEnd, total: rows.length })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('invoicing.previousPage')}
          disabled={currentPage === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('invoicing.nextPage')}
          disabled={currentPage >= totalPages - 1}
          onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
