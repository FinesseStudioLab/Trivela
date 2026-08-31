// Real-time subscription client (#626).
//
// Wraps an SSE EventSource with the behaviour the UI needs to consume a live
// campaign/participant stream instead of polling:
//
//   - parses JSON messages and forwards them as { id, type, data }
//   - de-duplicates by event id (idempotent against out-of-order/replayed
//     events) over a bounded window
//   - on connection drop, reconnects with capped exponential backoff (we drive
//     this explicitly rather than relying on EventSource's built-in retry so
//     callers can fall back to polling while disconnected)
//   - reports lifecycle via onStatusChange: connecting → open →
//     reconnecting → (open | failed | closed)
//
// Pure and dependency-free: EventSource is injectable so it can be unit-tested
// with a fake, and reconnection uses the global timers (controllable with fake
// timers in tests).

const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_DEDUP_WINDOW = 500;

/**
 * @param {{
 *   url: string,
 *   onEvent?: (event: { id: string|null, type: string, data: unknown }) => void,
 *   onStatusChange?: (status: string) => void,
 *   EventSourceImpl?: typeof EventSource,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   maxReconnectAttempts?: number,
 *   dedupWindow?: number,
 * }} options
 * @returns {{ close: () => void, getReconnectAttempts: () => number }}
 */
export function createRealtimeSubscription({
  url,
  onEvent,
  onStatusChange,
  EventSourceImpl = typeof globalThis !== 'undefined' ? globalThis.EventSource : undefined,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
  maxReconnectAttempts = Infinity,
  dedupWindow = DEFAULT_DEDUP_WINDOW,
} = {}) {
  if (!url) {
    throw new Error('createRealtimeSubscription requires a url');
  }
  if (typeof EventSourceImpl !== 'function') {
    throw new Error('EventSource is not available in this environment');
  }

  let source = null;
  let closed = false;
  let attempts = 0;
  let reconnectTimer = null;

  const seenIds = [];
  const seenSet = new Set();

  const setStatus = (status) => {
    onStatusChange?.(status);
  };

  // Returns true if this id was already seen (i.e. a duplicate to drop).
  const isDuplicate = (id) => {
    if (id === undefined || id === null || id === '') return false;
    if (seenSet.has(id)) return true;
    seenSet.add(id);
    seenIds.push(id);
    if (seenIds.length > dedupWindow) {
      seenSet.delete(seenIds.shift());
    }
    return false;
  };

  const handleMessage = (evt) => {
    let parsed;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      return; // ignore non-JSON keep-alives / comments
    }
    const id = parsed.id ?? evt.lastEventId ?? null;
    if (isDuplicate(id)) return;
    onEvent?.({
      id,
      type: parsed.type ?? evt.type ?? 'message',
      data: parsed.data ?? parsed,
    });
  };

  const scheduleReconnect = () => {
    if (closed) return;
    if (attempts >= maxReconnectAttempts) {
      setStatus('failed');
      return;
    }
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempts);
    attempts += 1;
    setStatus('reconnecting');
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect() {
    if (closed) return;
    setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
    source = new EventSourceImpl(url);
    source.onopen = () => {
      attempts = 0;
      setStatus('open');
    };
    source.onmessage = handleMessage;
    source.onerror = () => {
      // Take control of reconnection ourselves: close the failed source and
      // back off, so consumers can poll while we're disconnected.
      try {
        source?.close();
      } catch {
        /* noop */
      }
      source = null;
      scheduleReconnect();
    };
  }

  const close = () => {
    if (closed) return;
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      source?.close();
    } catch {
      /* noop */
    }
    source = null;
    setStatus('closed');
  };

  connect();

  return {
    close,
    getReconnectAttempts: () => attempts,
  };
}

export default createRealtimeSubscription;
