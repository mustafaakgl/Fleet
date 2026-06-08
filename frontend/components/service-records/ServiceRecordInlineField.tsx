'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { serviceRecordsApi } from '@/lib/api';
import type { ServiceRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

type EditableField = 'service_type' | 'notes';

interface ServiceRecordInlineFieldProps {
  record: ServiceRecord;
  field: EditableField;
  canEdit: boolean;
  onUpdated: (record: ServiceRecord) => void;
  className?: string;
}

export function ServiceRecordInlineField({
  record,
  field,
  canEdit,
  onUpdated,
  className,
}: ServiceRecordInlineFieldProps) {
  const { t } = useTranslation();
  const value = field === 'service_type' ? record.service_type : (record.notes ?? '');
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value, record.id]);

  if (!canEdit) {
    return (
      <span className={cn('text-sm text-gray-700', className)}>
        {field === 'notes' ? (value.trim() ? value : '-') : value}
      </span>
    );
  }

  async function save(nextValue: string) {
    const trimmed = nextValue.trim();
    if (field === 'service_type' && !trimmed) {
      setDraft(value);
      setError(t('serviceHistory.taskRequired'));
      return;
    }
    if (trimmed === value.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await serviceRecordsApi.update(record.id, { [field]: trimmed });
      onUpdated(updated);
    } catch (e) {
      setDraft(value);
      setError(e instanceof Error ? e.message : t('serviceHistory.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const inputClassName = cn(
    'h-9 min-w-[140px] text-sm',
    field === 'notes' && 'min-w-[180px]',
    saving && 'opacity-60',
    error && 'border-red-400',
    className,
  );

  return (
    <div className="space-y-1">
      {field === 'notes' ? (
        <textarea
          value={draft}
          disabled={saving}
          rows={2}
          placeholder={t('serviceHistory.notesPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save(draft)}
          className={cn(
            inputClassName,
            'h-auto min-h-[56px] w-full resize-y rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-50',
          )}
        />
      ) : (
        <Input
          value={draft}
          disabled={saving}
          placeholder={t('serviceHistory.taskPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={inputClassName}
        />
      )}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
