'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { documentHasFile, openAuthenticatedDocument } from '@/lib/file-access';
import type { Document } from '@/lib/types';

type DocumentFileLinkProps = {
  document: Pick<Document, 'id' | 'fileName' | 'download_url' | 'fileUrl'>;
  variant?: 'button' | 'link';
};

export function DocumentFileLink({ document, variant = 'button' }: DocumentFileLinkProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  if (!documentHasFile(document)) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  async function handleOpen() {
    setLoading(true);
    try {
      await openAuthenticatedDocument(document.id, document.fileName);
    } finally {
      setLoading(false);
    }
  }

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
      >
        {loading ? t('common.loading') : document.fileName}
      </button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleOpen} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="ml-1.5">{t('documents.openFile')}</span>
    </Button>
  );
}
