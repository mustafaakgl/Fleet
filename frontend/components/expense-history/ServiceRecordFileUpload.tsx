'use client';

import { useId, useState } from 'react';
import { FileText, ImageIcon, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ServiceRecordDocumentType = 'Photo' | 'Service Document' | 'Receipt';

type PendingFileUploadProps = {
  id?: string;
  label: string;
  hint: string;
  accept?: string;
  files: File[];
  onChange: (files: File[]) => void;
  onAddFiles?: (added: File[]) => void | Promise<void>;
  disabled?: boolean;
  icon?: 'photo' | 'document';
};

export function PendingFileUpload({
  id,
  label,
  hint,
  accept,
  files,
  onChange,
  onAddFiles,
  disabled,
  icon = 'document',
}: PendingFileUploadProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [dragOver, setDragOver] = useState(false);
  const Icon = icon === 'photo' ? ImageIcon : FileText;

  function addFiles(list: FileList | null) {
    if (!list?.length || disabled) return;
    const added = Array.from(list);
    onChange([...files, ...added]);
    void onAddFiles?.(added);
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  const dropzoneClassName = cn(
    'relative block rounded-md border border-dashed px-4 py-8 text-center transition-colors',
    disabled
      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
      : dragOver
        ? 'cursor-pointer border-[#1a4d7a] bg-[#e8f0f8]'
        : 'cursor-pointer border-slate-300 bg-white hover:border-[#1a4d7a] hover:bg-[#e8f0f8]/60',
  );

  return (
    <div className="space-y-3">
      <label
        htmlFor={disabled ? undefined : inputId}
        className={dropzoneClassName}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="mx-auto mb-2 h-5 w-5 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
        {!disabled ? (
          <input
            id={inputId}
            type="file"
            multiple
            accept={accept}
            tabIndex={-1}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          />
        ) : null}
      </label>

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate text-slate-700">{file.name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              </div>
              {!disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeFile(index)}
                  aria-label={label}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export async function uploadServiceRecordFiles(
  recordId: string,
  files: File[],
  documentType: ServiceRecordDocumentType,
  upload: (formData: FormData) => Promise<unknown>,
): Promise<void> {
  for (const file of files) {
    const formData = new FormData();
    formData.append('ownerType', 'service_record');
    formData.append('ownerId', recordId);
    formData.append('documentType', documentType);
    formData.append('file', file);
    await upload(formData);
  }
}
