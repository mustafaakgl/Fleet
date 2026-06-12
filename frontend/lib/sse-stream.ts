import { getToken } from './auth';

type StreamHandlers<T> = {
  onMessage: (payload: T) => void;
  onError?: (error: unknown) => void;
};

/**
 * Opens a lightweight SSE stream over fetch so we can attach Authorization
 * headers (native EventSource cannot do that in browsers).
 */
export function openSseStream<T>(url: string, handlers: StreamHandlers<T>): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const token = getToken();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        credentials: 'include',
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const dataLines = event
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart());

          if (dataLines.length === 0) continue;
          const payloadText = dataLines.join('\n');
          try {
            handlers.onMessage(JSON.parse(payloadText) as T);
          } catch (parseError) {
            handlers.onError?.(parseError);
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError?.(error);
      }
    }
  })();

  return () => controller.abort();
}
