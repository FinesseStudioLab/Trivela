const MAX_LABEL_LENGTH = 80;

/**
 * SSR- and exception-safe wrapper around window.localStorage.
 *
 * Returns null / silently no-ops when storage is unavailable (server-side
 * rendering, privacy mode, quota errors) so callers never have to guard each
 * access themselves.
 */
export const safeLocalStorage = {
  getItem(key) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore quota / security errors */
    }
  },
  removeItem(key) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

function sanitizeLabel(input) {
  if (typeof input !== 'string') {
    return undefined;
  }
  const compact = input.replace(/[^a-zA-Z0-9 _:\-./]/g, '').trim();
  if (!compact) {
    return undefined;
  }
  return compact.slice(0, MAX_LABEL_LENGTH);
}

export function logSafeEvent(eventName, metadata = {}) {
  if (typeof window === 'undefined' || typeof eventName !== 'string') {
    return;
  }

  const payload = {
    event: sanitizeLabel(eventName) || 'unknown_event',
    timestamp: new Date().toISOString(),
    metadata: Object.fromEntries(
      Object.entries(metadata)
        .map(([key, value]) => [sanitizeLabel(key), sanitizeLabel(String(value))])
        .filter(([key, value]) => Boolean(key) && Boolean(value)),
    ),
  };

  // Intentionally console-only and sanitized: no wallet, no API key, no PII.
  console.info('[analytics-safe]', payload);
}
