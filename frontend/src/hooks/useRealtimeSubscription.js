import { useEffect, useRef, useState } from 'react';
import { createRealtimeSubscription } from '../lib/realtimeClient';

/**
 * useRealtimeSubscription — React wrapper around createRealtimeSubscription.
 *
 * Opens an SSE subscription to `url` while `enabled`, forwarding parsed events
 * to `onEvent` and exposing the connection status. The subscription is torn
 * down (and reopened) when `url`/`enabled` change or on unmount.
 *
 * `onEvent` is read through a ref so that passing a fresh callback each render
 * does NOT churn the connection.
 *
 * @param {{
 *   url?: string,
 *   enabled?: boolean,
 *   onEvent?: (event: { id: string|null, type: string, data: unknown }) => void,
 *   EventSourceImpl?: typeof EventSource,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 * }} options
 * @returns {{ status: string, isLive: boolean }}
 */
export function useRealtimeSubscription({
  url,
  enabled = true,
  onEvent,
  EventSourceImpl,
  baseDelayMs,
  maxDelayMs,
} = {}) {
  const [status, setStatus] = useState('idle');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !url) {
      setStatus('idle');
      return undefined;
    }

    const ImplToUse =
      EventSourceImpl ?? (typeof globalThis !== 'undefined' ? globalThis.EventSource : undefined);
    if (typeof ImplToUse !== 'function') {
      // No SSE support (e.g. SSR or old browser) → caller keeps polling.
      setStatus('unsupported');
      return undefined;
    }

    const subscription = createRealtimeSubscription({
      url,
      EventSourceImpl: ImplToUse,
      baseDelayMs,
      maxDelayMs,
      onStatusChange: setStatus,
      onEvent: (event) => onEventRef.current?.(event),
    });

    return () => subscription.close();
  }, [url, enabled, EventSourceImpl, baseDelayMs, maxDelayMs]);

  return { status, isLive: status === 'open' };
}

export default useRealtimeSubscription;
