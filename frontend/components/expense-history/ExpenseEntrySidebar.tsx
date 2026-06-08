'use client';

import { useEffect, useState } from 'react';
import { FileText, ImageIcon, MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'fleet:expense-entry:sidebar';

export function ExpenseEntrySidebar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '0') setOpen(false);
    } catch {
      // ignore
    }
  }, []);

  function setSidebarOpen(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  }

  if (!open) {
    return (
      <div className="flex shrink-0 justify-end border-l border-slate-200 bg-white lg:w-12">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex h-full min-h-[320px] w-12 flex-col items-center border-none bg-white pt-3 text-slate-500 hover:bg-slate-50"
          title={t('expenseHistory.detail.showSidebar')}
          aria-label={t('expenseHistory.detail.showSidebar')}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const tools = [
    { icon: MessageSquare, label: t('expenseHistory.detail.activity') },
    { icon: ImageIcon, label: t('expenseHistory.detail.photos') },
    { icon: FileText, label: t('expenseHistory.detail.documents') },
  ];

  return (
    <aside className="flex w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3">
      <button
        type="button"
        onClick={() => setSidebarOpen(false)}
        className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        title={t('expenseHistory.detail.hideSidebar')}
        aria-label={t('expenseHistory.detail.hideSidebar')}
      >
        <PanelRightClose className="h-4 w-4" />
      </button>
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            className={cn(
              'mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </aside>
  );
}
