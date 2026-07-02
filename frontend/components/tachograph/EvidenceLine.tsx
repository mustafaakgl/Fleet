'use client';

import { useTranslation } from 'react-i18next';
import { formatEvidenceLineText } from '@/lib/tachograph-evidence';

type EvidenceLineProps = {
  type: string;
  evidence: Record<string, unknown> | null;
  className?: string;
};

export function EvidenceLine({ type, evidence, className }: EvidenceLineProps) {
  const { t } = useTranslation();
  const text = formatEvidenceLineText(type, evidence, t);

  return (
    <p className={className ?? 'text-sm leading-relaxed text-slate-700'}>
      {text}
    </p>
  );
}
