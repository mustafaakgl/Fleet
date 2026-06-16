'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudDownload, Ellipsis, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DriverActionsMenuProps {
  canImport: boolean;
  onImport: () => void;
  onExport?: () => void;
  showExport?: boolean;
}

export function DriverActionsMenu({
  canImport,
  onImport,
  onExport,
  showExport = true,
}: DriverActionsMenuProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10"
        aria-label={t('drivers.moreActions', { defaultValue: 'More actions' })}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis className="h-4 w-4" />
      </Button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {canImport ? (
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onImport();
              }}
            >
              <span>{t('drivers.import.menuLabel', { defaultValue: 'Import Driver' })}</span>
              <Upload className="h-4 w-4 text-slate-400" />
            </button>
          ) : null}
          {showExport ? (
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50',
                canImport && 'border-t border-slate-100',
              )}
              onClick={() => {
                setOpen(false);
                onExport?.();
              }}
            >
              <span>{t('drivers.export.menuLabel', { defaultValue: 'Export Driver' })}</span>
              <CloudDownload className="h-4 w-4 text-slate-400" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
