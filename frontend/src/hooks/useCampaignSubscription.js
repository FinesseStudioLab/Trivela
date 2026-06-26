import { useCallback, useEffect, useRef, useState } from 'react';
import { getRealtimeUrl } from '../config';
import { useCampaignPolling } from './useCampaignPolling';

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_EVENTS_PER_FLUSH = 50;

function nextBackoff(current) {
  return Math.min(current * 2, MAX_BACKOFF_MS);
}

/**
 * Real-time campaign subscription via SSE with exponential-backoff reconnect
 * and automatic fallback to polling when SSE is unavailable.
 *
 * Returns the same shape as useCampaignPolling so callers can swap them.
 */
export function useCampaignSubscription({ campaignId, contractId, enabled = true }) {
  const realtimeUrl = getRealtimeUrl(campaignId);
  const useRealtime = Boolean(realtimeUrl && campaignId && enabled);

  // Polling fallback — always created, only active when SSE is unavailable.
  const polling = useCampaignPolling({
    campaignId,
    contractId,
    enabled: !useRealtime && enabled,
  });

  const [campaign, setCampaign] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [stateToast, setStateToast] = useState('');

  const esRef = useRef(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const retryTimerRef = useRef(null);
  const pendingRef = useRef([]);
  const flushTimerRef = useRef(null);
  const mountedRef = useRef(false);

  const applyEvent = useCallback((payload) => {
    if (!payload) return;
    if (payload.campaign) setCampaign((prev) => ({ ...prev, ...payload.campaign }));
    if (payload.participantCount !== undefined) {
      setCampaign((prev) => prev ? { ...prev, participantCount: payload.participantCount } : prev);
    }
    setLastUpdated(new Date());
    setStateToast('Live update received');
  }, []);

  const flushPending = useCallback(() => {
    const batch = pendingRef.current.splice(0, MAX_EVENTS_PER_FLUSH);
    for (const payload of batch) applyEvent(payload);
    flushTimerRef.current = null;
  }, [applyEvent]);

  const scheduleFlush = useCallback(() => {
    if (!flushTimerRef.current) {
      flushTimerRef.current = window.setTimeout(flushPending, 0);
    }
  }, [flushPending]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !useRealtime) return;

    const es = new EventSource(realtimeUrl, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      backoffRef.current = MIN_BACKOFF_MS;
      setIsLive(true);
      setError('');
    };

    es.onmessage = (evt) => {
      if (!mountedRef.current) return;
      try {
        const payload = JSON.parse(evt.data);
        pendingRef.current.push(payload);
        scheduleFlush();
      } catch {
        /* malformed event — skip */
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      esRef.current = null;
      setIsLive(false);

      const delay = backoffRef.current;
      backoffRef.current = nextBackoff(delay);
      setError(`Connection lost — retrying in ${Math.round(delay / 1000)}s`);

      retryTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [realtimeUrl, scheduleFlush, useRealtime]);

  useEffect(() => {
    if (!useRealtime) return undefined;

    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      window.clearTimeout(retryTimerRef.current);
      window.clearTimeout(flushTimerRef.current);
      setIsLive(false);
    };
  }, [connect, useRealtime]);

  useEffect(() => {
    if (!stateToast) return undefined;
    const t = window.setTimeout(() => setStateToast(''), 4000);
    return () => window.clearTimeout(t);
  }, [stateToast]);

  if (!useRealtime) return polling;

  return {
    campaign: campaign ?? polling.campaign,
    setCampaign,
    onChainState: polling.onChainState,
    isPolling: false,
    isLive,
    isPaused: false,
    lastUpdated,
    stateToast,
    error,
    refresh: polling.refresh,
  };
}
