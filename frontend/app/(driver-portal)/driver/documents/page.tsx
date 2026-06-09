'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { driverPortalApi } from '@/lib/api';
import {
  DRIVER_UPLOAD_DOCUMENT_TYPES,
  driverDocumentTypeLabelKey,
} from '@/lib/driver-portal-documents';
import { openAuthenticatedFile } from '@/lib/file-access';
import type { DriverDocumentsResponse } from '@/lib/types';

export default function DriverDocumentsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DriverDocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [documentType, setDocumentType] = useState<string>(DRIVER_UPLOAD_DOCUMENT_TYPES[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await driverPortalApi.listDocuments();
    setData(response);
  }

  useEffect(() => {
    load()
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError(t('driverPortal.documents.fileRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.uploadDocument({
        documentType,
        expiryDate: expiryDate || undefined,
        notes: notes || undefined,
        file,
      });
      setFile(null);
      setNotes('');
      setExpiryDate('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.documents.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.profile.documents')} href="/driver/profile" />
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{t('driverPortal.documents.title')}</CardTitle>
            <p className="text-sm text-slate-600">{t('driverPortal.documents.subtitle')}</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('driverPortal.assignments.loading')}
              </div>
            ) : (
              <>
                {(data?.missingUploadableRequired?.length ?? 0) > 0 ? (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    {t('driverPortal.documents.missingOptional', {
                      types: data?.missingUploadableRequired.join(', '),
                    })}
                  </div>
                ) : null}

                <form className="space-y-3" onSubmit={(e) => void handleUpload(e)}>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.documents.type')}</Label>
                    <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                      {DRIVER_UPLOAD_DOCUMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(driverDocumentTypeLabelKey(type))}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.documents.expiry')}</Label>
                    <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.documents.notes')}</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.documents.file')}</Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                  <Button type="submit" className="bg-[#1a4d7a] hover:bg-[#163a5c]" disabled={busy}>
                    {t('driverPortal.documents.upload')}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>

        {data?.items?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('driverPortal.documents.listTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-100 text-sm">
                {data.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="font-medium">{t(driverDocumentTypeLabelKey(item.documentType))}</p>
                      <p className="text-slate-600">{item.fileName}</p>
                      <p className="text-xs text-slate-500">{item.status}</p>
                    </div>
                    {item.download_url ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void openAuthenticatedFile(item.download_url!, item.fileName)}
                      >
                        {t('driverPortal.documents.open')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DriverPortalShell>
  );
}
