'use client';

import { use } from 'react';
import { ExpenseEntryDetailPage } from '@/components/expense-history/ExpenseEntryDetailPage';

export default function ExpenseEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ExpenseEntryDetailPage entryId={id} />;
}
