'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { prepareHandoverPhotoFile } from '@/lib/handover-photo-metadata';
import { cn } from '@/lib/utils';

type HandoverCameraCaptureProps = {
  slotLabel: string;
  disabled?: boolean;
  queued?: boolean;
  onCaptured: (file: File, metadata: { takenAt: string; gpsLat?: number; gpsLng?: number; deviceInfo: string }) => void;
  onError: (message: string) => void;
};

export function HandoverCameraCapture({
  slotLabel,
  disabled,
  queued,
  onCaptured,
  onError,
}: HandoverCameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setStarting(true);
    setPermissionDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setOpen(true);
    } catch {
      setPermissionDenied(true);
      onError(t('driverPortal.handover.cameraPermissionRequired'));
    } finally {
      setStarting(false);
    }
  }, [onError, t]);

  useEffect(() => () => stopStream(), [stopStream]);

  async function handleCapture() {
    const video = videoRef.current;
    if (!video || capturing || !video.videoWidth || !video.videoHeight) {
      return;
    }

    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas unavailable');
      }
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Capture failed'))),
          'image/jpeg',
          0.92,
        );
      });

      const { file, metadata } = await prepareHandoverPhotoFile(
        blob,
        `handover-${Date.now()}.jpg`,
      );
      stopStream();
      setOpen(false);
      onCaptured(file, metadata);
    } catch {
      onError(t('driverPortal.handover.captureFailed'));
    } finally {
      setCapturing(false);
    }
  }

  if (permissionDenied) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-medium">{t('driverPortal.handover.cameraPermissionRequired')}</p>
        <p className="mt-1">{t('driverPortal.handover.cameraPermissionBlocked')}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {queued ? (
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            {t('driverPortal.pwa.queued')}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={disabled || starting}
          onClick={() => void startCamera()}
        >
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {t('driverPortal.handover.openCamera')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
        <button
          type="button"
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
          aria-label={t('common.close')}
          onClick={() => {
            stopStream();
            setOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-500">{slotLabel}</p>
        {queued ? (
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            {t('driverPortal.pwa.queued')}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        className={cn('w-full')}
        disabled={capturing}
        onClick={() => void handleCapture()}
      >
        {capturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
        {t('driverPortal.handover.takePhoto')}
      </Button>
    </div>
  );
}
