import type { DefectSeverity, DefectStatus } from '@/lib/types';

export function defectStatusClass(status: DefectStatus): string {
  if (status === 'offen') return 'bg-rose-100 text-rose-800';
  if (status === 'in_reparatur') return 'bg-amber-100 text-amber-800';
  if (status === 'behoben') return 'bg-blue-100 text-blue-800';
  return 'bg-emerald-100 text-emerald-800';
}

export function defectSeverityClass(severity: DefectSeverity): string {
  if (severity === 'kritisch') return 'bg-rose-100 text-rose-800';
  if (severity === 'mittel') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

export function DefectStatusBadge({ status, label }: { status: DefectStatus; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${defectStatusClass(status)}`}>
      {label}
    </span>
  );
}

export function DefectSeverityBadge({ severity, label }: { severity: DefectSeverity; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${defectSeverityClass(severity)}`}>
      {label}
    </span>
  );
}
