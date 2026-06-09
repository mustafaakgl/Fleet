'use client';

import { useRef, useState } from 'react';
import { Download, FileUp, Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { remindersApi } from '@/lib/api';
import {
  listVehicleReminderAttachments,
  saveVehicleReminderAttachment,
} from '@/lib/custom-vehicle-reminders';
import { parseVehicleRemindersCsv } from '@/lib/vehicle-reminders-csv';
import type { Vehicle } from '@/lib/types';

interface VehicleReminderImportDialogProps {
  open: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
  onImported: () => void;
}

export function VehicleReminderImportDialog({
  open,
  vehicles,
  onClose,
  onImported,
}: VehicleReminderImportDialogProps) {
  const { t } = useTranslation();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCsvFile(null);
    setDocFile(null);
    setImportedCount(null);
    setUploadedDocName(null);
    setError(null);
    if (csvInputRef.current) csvInputRef.current.value = '';
    if (docInputRef.current) docInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleImportData() {
    if (!csvFile) return;
    setLoading(true);
    setError(null);
    try {
      const text = await csvFile.text();
      const rows = parseVehicleRemindersCsv(text, vehicles);
      if (rows.length === 0) {
        throw new Error(t('vehicleReminders.import.empty'));
      }
      const result = await remindersApi.bulkCreateVehicleReminders(rows);
      if (result.created === 0) {
        throw new Error(t('vehicleReminders.import.error'));
      }
      setImportedCount(result.created);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vehicleReminders.import.error'));
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadDocument() {
    if (!docFile) return;
    setLoading(true);
    setError(null);
    try {
      const saved = saveVehicleReminderAttachment(docFile);
      if (!saved) {
        throw new Error(t('vehicleReminders.import.documentTooLarge'));
      }
      setUploadedDocName(saved.fileName);
      setDocFile(null);
      if (docInputRef.current) docInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vehicleReminders.import.documentError'));
    } finally {
      setLoading(false);
    }
  }

  const attachmentCount = listVehicleReminderAttachments().length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('vehicleReminders.import.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">{t('vehicleReminders.import.dataTitle')}</h3>
            <p className="text-sm text-slate-600">{t('vehicleReminders.import.hint')}</p>

            <a
              href="data:text/csv;charset=utf-8,vehicle_plate%2Crenewal_type%2Cdue_date%2Cdue_soon_threshold%2Cdue_soon_unit%2Cnotifications%2Ccomment%0AABC123%2Cinspection%2C2026-12-01%2C3%2Cweeks%2Ctrue%2C"
              download="vehicle-reminders-sample.csv"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#1a4d7a] hover:underline"
            >
              <Download className="h-4 w-4" />
              {t('vehicleReminders.import.downloadSample')}
            </a>

            <div
              className="relative rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) setCsvFile(dropped);
              }}
            >
              <Upload className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">{t('vehicleReminders.import.dropLabel')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('vehicleReminders.import.dropHint')}</p>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {csvFile ? <p className="text-xs text-slate-600">{csvFile.name}</p> : null}
            {importedCount != null ? (
              <p className="text-sm text-green-700">
                {t('vehicleReminders.import.success', { count: importedCount })}
              </p>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">{t('vehicleReminders.import.documentTitle')}</h3>
            <p className="text-sm text-slate-600">{t('vehicleReminders.import.documentHint')}</p>

            <div
              className="relative rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) setDocFile(dropped);
              }}
            >
              <FileUp className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">{t('vehicleReminders.import.documentDropLabel')}</p>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.doc,.docx"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => setDocFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {docFile ? <p className="text-xs text-slate-600">{docFile.name}</p> : null}
            {uploadedDocName ? (
              <p className="text-sm text-green-700">
                {t('vehicleReminders.import.documentSuccess', { name: uploadedDocName })}
              </p>
            ) : null}
            {attachmentCount > 0 ? (
              <p className="text-xs text-slate-500">
                {t('vehicleReminders.import.documentCount', { count: attachmentCount })}
              </p>
            ) : null}
          </section>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!docFile || loading}
              onClick={() => void handleUploadDocument()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('vehicleReminders.import.uploadDocument')}
            </Button>
            <Button
              type="button"
              className="bg-[#1a4d7a] hover:bg-[#163a5c]"
              disabled={!csvFile || loading}
              onClick={() => void handleImportData()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('vehicleReminders.import.importData')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
