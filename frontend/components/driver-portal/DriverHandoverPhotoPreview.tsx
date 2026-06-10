'use client';

import { useAuthenticatedImageUrl } from '@/lib/file-access';

type DriverHandoverPhotoPreviewProps = {
  documentId: string;
  alt: string;
};

export function DriverHandoverPhotoPreview({ documentId, alt }: DriverHandoverPhotoPreviewProps) {
  const imageUrl = useAuthenticatedImageUrl(`/driver/documents/${documentId}/download`);

  if (!imageUrl) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
        …
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt={alt} className="h-32 w-full rounded-md object-cover" />
  );
}
