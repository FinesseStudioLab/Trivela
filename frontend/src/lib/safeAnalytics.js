const MAX_LABEL_LENGTH = 80;

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
