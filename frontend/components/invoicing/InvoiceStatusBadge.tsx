'use client';

import { useTranslation } from 'react-i18next';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { OutgoingInvoiceStatus } from '@/lib/types';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const STATUS_VARIANT: Record<OutgoingInvoiceStatus, BadgeVariant> = {
  draft: 'secondary',
  finalized: 'default',
  sent: 'default',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'outline',
};

export function invoiceStatusVariant(status: OutgoingInvoiceStatus): BadgeVariant {
  return STATUS_VARIANT[status] ?? 'secondary';
}

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: OutgoingInvoiceStatus;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Badge variant={invoiceStatusVariant(status)} className={className}>
      {t(`invoicing.invoiceStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}
