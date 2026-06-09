'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { importApi, type ImportResult } from '@/lib/api';

interface ServiceHistoryImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ServiceHistoryImportDialog({
  open,
  onClose,
  onImported,
}: ServiceHistoryImportDialogProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const importResult = await importApi.serviceRecords(file);
      setResult(importResult);
      if (importResult.created > 0) {
        onImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('serviceHistory.import.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('serviceHistory.import.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('serviceHistory.import.hint')}</p>

          <a
            href="/samples/service-records.csv"
            download
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline"
          >
            <Download className="h-4 w-4" />
            {t('serviceHistory.import.downloadSample')}
          </a>

          <div
            className="relative rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
          >
            <Upload className="mx-auto mb-2 h-5 w-5 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">{t('serviceHistory.import.dropLabel')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('serviceHistory.import.dropHint')}</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>

          {file ? (
            <p className="text-sm text-slate-700">
              {t('serviceHistory.import.selectedFile', { name: file.name })}
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {result ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>{t('import.result.created', { count: result.created })}</p>
              <p>{t('import.result.skipped', { count: result.skipped })}</p>
              {result.errors.length > 0 ? (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-red-700">
                  {result.errors.slice(0, 10).map((item) => (
                    <li key={`${item.row}-${item.message}`}>
                      {t('import.result.errorRow', { row: item.row, message: item.message })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          {!result ? (
            <Button type="button" disabled={!file || loading} onClick={() => void handleImport()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {loading ? t('import.uploading') : t('serviceHistory.import.upload')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
