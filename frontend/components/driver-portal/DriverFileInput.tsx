'use client';

import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DriverFileInputProps {
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  files: File[];
  maxFiles?: number;
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function DriverFileInput({
  label,
  hint,
  accept = 'image/*,.pdf',
  multiple = true,
  files,
  maxFiles = 5,
  onChange,
  disabled,
}: DriverFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (!picked.length) return;
    const merged = [...files, ...picked].slice(0, maxFiles);
    onChange(merged);
    event.target.value = '';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || files.length >= maxFiles}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </div>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handlePick}
      />
      {files.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-600">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="shrink-0 text-red-600 hover:underline"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
