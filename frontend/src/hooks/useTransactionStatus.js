import { useCallback, useEffect, useRef, useState } from 'react';

export const TERMINAL_STATUSES = new Set([
  'confirmed',
  'failed',
  'success',
  'error',
  'SUCCESS',
  'FAILED',
]);

/**
 * Checks whether a given transaction status string represents a terminal lifecycle state.
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  if (!status) return false;
  return TERMINAL_STATUSES.has(status);
}

/**
 * useTransactionStatus — polls transaction status on a 3-second interval
 * until a terminal state ('confirmed' | 'failed') is reached, then immediately
 * stops polling to prevent battery and network waste (#1485).
 *
 * @param {{
 *   hash?: string,
 *   enabled?: boolean,
 *   pollIntervalMs?: number,
 *   fetchStatusFn?: (hash: string) => Promise<{ status: string }>,
 *   onTerminal?: (status: string) => void,
 * }} options
 */
export function useTransactionStatus({
  hash,
  enabled = true,
  pollIntervalMs = 3000,
  fetchStatusFn,
  onTerminal,
} = {}) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const timerRef = useRef(null);
  const stoppedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPolling(false);
    stoppedRef.current = true;
  }, []);

  const checkStatus = useCallback(async () => {
    if (!hash || stoppedRef.current) return;

    try {
      let result;
      if (fetchStatusFn) {
        result = await fetchStatusFn(hash);
      } else {
        const res = await fetch(`/api/v1/transactions/${hash}/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        result = await res.json();
      }

      const currentStatus = result?.status ?? null;
      setStatus(currentStatus);

      if (isTerminalStatus(currentStatus)) {
        stopPolling();
        onTerminal?.(currentStatus);
      }
    } catch (err) {
      setError(err?.message ?? 'Failed to check status');
    }
  }, [hash, fetchStatusFn, onTerminal, stopPolling]);

  useEffect(() => {
    if (!enabled || !hash) {
      stopPolling();
      return;
    }

    stoppedRef.current = false;
    setIsPolling(true);

    // Initial status check
    checkStatus();

    timerRef.current = setInterval(() => {
      if (stoppedRef.current) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      checkStatus();
    }, pollIntervalMs);

    return () => {
      stopPolling();
    };
  }, [hash, enabled, pollIntervalMs, checkStatus, stopPolling]);

  return {
    status,
    isTerminal: isTerminalStatus(status),
    isPolling,
    error,
    stopPolling,
  };
}

export default useTransactionStatus;
