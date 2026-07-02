'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatFleetDateTime } from '@/lib/locale-format';

export type ConnectionBannerStatus = 'connected' | 'reconnecting' | 'disconnected';

type ConnectionBannerProps = {
  status: ConnectionBannerStatus;
  lastUpdatedAt?: Date | null;
  className?: string;
};

export function ConnectionBanner({ status, lastUpdatedAt, className }: ConnectionBannerProps) {
  const { t } = useTranslation();
  const [showConnectedFlash, setShowConnectedFlash] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);

  useEffect(() => {
    if (prevStatus !== 'connected' && status === 'connected') {
      setShowConnectedFlash(true);
      const timer = window.setTimeout(() => setShowConnectedFlash(false), 2_000);
      setPrevStatus(status);
      return () => window.clearTimeout(timer);
    }
    setPrevStatus(status);
    return undefined;
  }, [prevStatus, status]);

  if (status === 'connected' && !showConnectedFlash) {
    return null;
  }

  const isConnectedFlash = status === 'connected' && showConnectedFlash;
  const isReconnecting = status === 'reconnecting';
  const isDisconnected = status === 'disconnected';

  return (
    <div
      role="status"
      data-testid="connection-banner"
      data-connection-status={isConnectedFlash ? 'connected-flash' : status}
      className={cn(
        'border-b px-4 py-2 text-center text-sm',
        isConnectedFlash && 'border-emerald-200 bg-emerald-50 text-emerald-800',
        isReconnecting && 'border-amber-200 bg-amber-50 text-amber-900',
        isDisconnected && 'border-amber-200 bg-amber-50 text-amber-900',
        className,
      )}
    >
      <span>
        {isConnectedFlash
          ? t('connectionBanner.connected')
          : isReconnecting
            ? t('connectionBanner.reconnecting')
            : t('connectionBanner.disconnected')}
      </span>
      {lastUpdatedAt && (isReconnecting || isDisconnected) ? (
        <span className="ml-2 text-xs opacity-80">
          {t('connectionBanner.lastUpdate', {
            time: formatFleetDateTime(lastUpdatedAt.toISOString()).slice(-5),
          })}
        </span>
      ) : null}
    </div>
  );
}
