import { useCallback, useMemo, useRef, useState } from 'react';
import { useCampaignPolling } from './useCampaignPolling';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { getRealtimeUrl } from '../config';

/**
 * useCampaignLiveUpdates — augments useCampaignPolling with a real-time SSE
 * stream (#626). Behaviour:
 *
 *   - subscribes to the campaign's SSE stream when one is configured;
 *   - while the stream is live, interval polling is paused (no wasteful
 *     requests) and live events drive updates;
 *   - each event merges any carried campaign fields into the cache (so
 *     participant counts / claims update live) and then triggers a refresh to
 *     reconcile against the authoritative API + on-chain state — idempotent, so
 *     duplicate/out-of-order events are harmless;
 *   - on disconnect, polling resumes automatically as a fallback; if no stream
 *     is configured it is pure polling, exactly as before.
 *
 * Returns the same shape as useCampaignPolling plus `{ isLive, connectionStatus,
 * realtimeEnabled, liveUpdatedAt }`, so it is a drop-in replacement.
 *
 * @param {{
 *   campaignId?: string,
 *   contractId?: string,
 *   enabled?: boolean,
 *   realtimeUrl?: string,
 *   eventSourceImpl?: typeof EventSource,
 * }} options
 */
export function useCampaignLiveUpdates({
  campaignId,
  contractId,
  enabled = true,
  realtimeUrl,
  eventSourceImpl,
} = {}) {
  const url = realtimeUrl ?? getRealtimeUrl(campaignId);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);

  // Filled in after useCampaignPolling runs; read lazily inside handleEvent so
  // the event handler identity stays stable (no connection churn).
  const refreshRef = useRef(null);
  const setCampaignRef = useRef(null);

  const handleEvent = useCallback((event) => {
    setLiveUpdatedAt(new Date());

    const data = event?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      setCampaignRef.current?.((prev) => (prev ? { ...prev, ...data } : prev));
    }

    // Reconcile with the source of truth (API + chain). Idempotent.
    refreshRef.current?.();
  }, []);

  const { status, isLive } = useRealtimeSubscription({
    url,
    enabled: enabled && Boolean(url),
    onEvent: handleEvent,
    EventSourceImpl: eventSourceImpl,
  });

  // Poll only while NOT live: covers the initial baseline load and acts as the
  // fallback whenever the stream is down.
  const poll = useCampaignPolling({
    campaignId,
    contractId,
    enabled: enabled && !isLive,
  });

  refreshRef.current = poll.refresh;
  setCampaignRef.current = poll.setCampaign;

  const lastUpdated = useMemo(() => {
    const liveMs = liveUpdatedAt?.getTime?.() ?? 0;
    const pollMs = poll.lastUpdated?.getTime?.() ?? 0;
    return pollMs >= liveMs ? poll.lastUpdated : liveUpdatedAt;
  }, [liveUpdatedAt, poll.lastUpdated]);

  return {
    ...poll,
    lastUpdated,
    isLive,
    connectionStatus: status,
    realtimeEnabled: Boolean(url),
    liveUpdatedAt,
  };
}

export default useCampaignLiveUpdates;
