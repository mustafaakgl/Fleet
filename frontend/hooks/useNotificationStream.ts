'use client';

import { useEffect, useRef } from 'react';
import { openSseStream } from '@/lib/sse-stream';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export interface NotificationSseEvent {
  type: 'new_notification' | 'unread_count';
  unreadCount: number;
  notification?: {
    id: string;
    title: string;
    message: string;
    type: string;
    priority: string;
    createdAt: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  };
}

type Options = {
  onEvent: (event: NotificationSseEvent) => void;
  enabled?: boolean;
};

/**
 * Opens a persistent SSE connection to /notifications/stream and calls
 * `onEvent` whenever the backend pushes a notification update.
 * Automatically reconnects with exponential backoff on disconnection.
 */
export function useNotificationStream({ onEvent, enabled = true }: Options) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let stopFn: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let delay = 2000;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      stopFn = openSseStream<NotificationSseEvent>(
        `${BASE_URL}/notifications/stream`,
        {
          onMessage: (event) => {
            delay = 2000; // reset backoff on successful message
            onEventRef.current(event);
          },
          onError: () => {
            stopFn?.();
            stopFn = null;
            if (!unmounted) {
              reconnectTimer = setTimeout(() => {
                delay = Math.min(delay * 2, 30_000);
                connect();
              }, delay);
            }
          },
        },
      );
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopFn?.();
    };
  }, [enabled]);
}
