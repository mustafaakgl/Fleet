'use client';

import { useTranslation } from 'react-i18next';
import { documentDownloadApiPath, useAuthenticatedImageUrl } from '@/lib/file-access';
import type { DriverHandoverPhotoSlot } from '@/lib/types';

type HandoverPhotoPreviewProps = {
  slot: DriverHandoverPhotoSlot;
  photo?: {
    id: string;
    fileName: string;
    download_url?: string | null;
    validationStatus?: 'validated' | 'location_mismatch';
  };
  slotLabel: string;
  validatedLabel?: string;
  mismatchLabel?: string;
};

export function HandoverPhotoPreview({
  slot,
  photo,
  slotLabel,
  validatedLabel,
  mismatchLabel,
}: HandoverPhotoPreviewProps) {
  const { t } = useTranslation();
  const imageUrl = useAuthenticatedImageUrl(
    photo?.download_url ?? (photo?.id ? documentDownloadApiPath(photo.id) : null),
  );

  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">{slotLabel}</p>
        {photo?.validationStatus === 'location_mismatch' ? (
          <span className="text-xs font-medium text-amber-700">
            ⚠ {mismatchLabel ?? t('handover.photoLocationMismatch')}
          </span>
        ) : photo ? (
          <span className="text-xs font-medium text-emerald-700">
            ✓ {validatedLabel ?? t('handover.photoValidated')}
          </span>
        ) : null}
      </div>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={`${slot} handover`} className="h-28 w-full rounded-md object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
          —
        </div>
      )}
    </div>
  );
}
