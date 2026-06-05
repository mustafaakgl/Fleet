'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Loader2, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthenticatedImageUrl, vehiclePhotoApiPath } from '@/lib/file-access';
import { vehiclesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type VehiclePlateDisplayProps = {
  plate: string;
  photoUrl?: string | null;
  brand?: string;
  model?: string;
  href?: string;
  vehicleId?: string;
  onPhotoUploaded?: (photoUrl: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: { wrap: 'w-[72px]', image: 'h-12 w-[72px]', text: 'text-sm', icon: 'h-5 w-5' },
  md: { wrap: 'w-[88px]', image: 'h-14 w-[88px]', text: 'text-sm', icon: 'h-6 w-6' },
  lg: { wrap: 'w-[120px]', image: 'h-20 w-[120px]', text: 'text-base', icon: 'h-7 w-7' },
};

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/jpg,image/png,image/webp';

function VehiclePhoto({
  src,
  alt,
  className,
  iconClassName,
}: {
  src: string;
  alt: string;
  className: string;
  iconClassName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200', className)}>
        <Truck className={cn('text-slate-400', iconClassName)} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn('h-full w-full object-cover', className)}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function VehiclePlateDisplay({
  plate,
  photoUrl,
  brand,
  model,
  href,
  vehicleId,
  onPhotoUploaded,
  size = 'md',
  className,
}: VehiclePlateDisplayProps) {
  const { t } = useTranslation();
  const dims = sizeClasses[size];
  const subtitle = [brand, model].filter(Boolean).join(' ');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canUpload = Boolean(vehicleId);
  const photoApiPath =
    photoUrl && photoUrl.startsWith('/vehicles/')
      ? photoUrl
      : vehicleId && photoUrl
        ? vehiclePhotoApiPath(vehicleId)
        : null;
  const displayUrl = useAuthenticatedImageUrl(photoApiPath);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !vehicleId) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const updated = await vehiclesApi.uploadPhoto(vehicleId, formData);
      const nextUrl = updated.photo_url ?? '';
      onPhotoUploaded?.(nextUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('vehicles.photoUploadFailed', 'Photo upload failed');
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }

  const imageBlock = (
    <div className={cn('relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm', dims.image)}>
      {displayUrl ? (
        <VehiclePhoto
          src={displayUrl}
          alt={`${plate} ${subtitle}`.trim()}
          className=""
          iconClassName={dims.icon}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <Truck className={cn('text-slate-400', dims.icon)} strokeWidth={1.5} />
        </div>
      )}

      {canUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            className={cn(
              'absolute inset-0 z-10 flex items-center justify-center transition',
              uploading ? 'cursor-wait bg-black/40' : 'cursor-pointer bg-black/0 hover:bg-black/35',
            )}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={t('vehicles.uploadPhoto', 'Upload vehicle photo')}
            title={t('vehicles.uploadPhoto', 'Upload vehicle photo')}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            ) : (
              <Camera className="h-6 w-6 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
            )}
          </button>
        </>
      ) : null}
    </div>
  );

  const plateLabel = (
    <p className={cn('font-semibold leading-tight text-slate-900', dims.text)}>{plate}</p>
  );

  return (
    <div className={cn('group flex flex-col items-center gap-1.5', dims.wrap, className)}>
      {imageBlock}
      <div className="w-full text-center">
        {href ? (
          <Link href={href} className="inline-block rounded transition hover:text-purple-700">
            {plateLabel}
          </Link>
        ) : (
          plateLabel
        )}
        {subtitle ? <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">{subtitle}</p> : null}
        {uploadError ? <p className="mt-1 text-[10px] text-red-600">{uploadError}</p> : null}
      </div>
    </div>
  );
}
