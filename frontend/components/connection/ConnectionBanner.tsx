'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatFleetDateTime } from '@/lib/locale-format';
import { showToast } from '@/lib/toast';

export type ConnectionBannerStatus = 'connected' | 'reconnecting' | 'disconnected';

type ConnectionBannerProps = {
  status: ConnectionBannerStatus;
  lastUpdatedAt?: Date | null;
  className?: string;
};

export function ConnectionBanner({ status, lastUpdatedAt, className }: ConnectionBannerProps) {
  const { t } = useTranslation();
  const [prevStatus, setPrevStatus] = useState(status);

  useEffect(() => {
    if (prevStatus !== 'connected' && status === 'connected') {
      showToast({
        message: t('connectionBanner.connected'),
        type: 'success',
        durationMs: 2200,
      });
      setPrevStatus(status);
      return undefined;
    }
    setPrevStatus(status);
    return undefined;
  }, [prevStatus, status, t]);

  if (status === 'connected') {
    return null;
  }

  const isReconnecting = status === 'reconnecting';
  const isDisconnected = status === 'disconnected';

  return (
    <div
      role="status"
      data-testid="connection-banner"
      data-connection-status={status}
      className={cn(
        'border-b px-4 py-2 text-center text-sm',
        isReconnecting && 'border-amber-200 bg-amber-50 text-amber-900',
        isDisconnected && 'border-amber-200 bg-amber-50 text-amber-900',
        className,
      )}
    >
      <span>
        {isReconnecting ? t('connectionBanner.reconnecting') : t('connectionBanner.disconnected')}
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
