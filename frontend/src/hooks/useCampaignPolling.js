import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, getPollIntervalMs } from '../config';
import { fetchCampaignOnChainState } from '../stellar';

function chainStateKey(state) {
  if (!state) return 'none';
  return `${state.isActive}:${state.isWithinWindow}:${state.participantCount}`;
}

export function useCampaignPolling({ campaignId, contractId, enabled = true }) {
  const [campaign, setCampaign] = useState(null);
  const [onChainState, setOnChainState] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stateToast, setStateToast] = useState('');
  const [error, setError] = useState('');
  const chainKeyRef = useRef(null);
  const intervalRef = useRef(null);
  const pollInFlightRef = useRef(false);

  const pollOnce = useCallback(async () => {
    if (!campaignId || pollInFlightRef.current) {
      return;
    }

    pollInFlightRef.current = true;
    setIsPolling(true);

    try {
      const response = await fetch(apiUrl(`/api/v1/campaigns/${campaignId}`));
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Campaign not found');
        }
        throw new Error(`API returned ${response.status}`);
      }
      const data = await response.json();
      setCampaign(data);
      setError('');

      const resolvedContractId = contractId || data.contractId;
      let nextChainState = null;
      if (resolvedContractId) {
        try {
          nextChainState = await fetchCampaignOnChainState(resolvedContractId);
          setOnChainState(nextChainState);
        } catch {
          setOnChainState(null);
        }
      }

      const nextKey = chainStateKey(nextChainState);
      if (chainKeyRef.current && nextKey !== chainKeyRef.current) {
        setStateToast('Campaign state updated');
      }
      chainKeyRef.current = nextKey;
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Unable to load campaign details.');
    } finally {
      pollInFlightRef.current = false;
      setIsPolling(false);
    }
  }, [campaignId, contractId]);

  const refresh = useCallback(() => {
    return pollOnce();
  }, [pollOnce]);

  useEffect(() => {
    if (!enabled || !campaignId) {
      return undefined;
    }

    const intervalMs = getPollIntervalMs();
    let paused = document.visibilityState === 'hidden';
    setIsPaused(paused);

    const handleVisibility = () => {
      paused = document.visibilityState === 'hidden';
      setIsPaused(paused);
      if (!paused) {
        pollOnce();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    pollOnce();

    intervalRef.current = window.setInterval(() => {
      if (!paused) {
        pollOnce();
      }
    }, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [campaignId, enabled, pollOnce]);

  useEffect(() => {
    if (!stateToast) return undefined;
    const timer = window.setTimeout(() => setStateToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [stateToast]);

  return {
    campaign,
    setCampaign,
    onChainState,
    isPolling,
    isPaused,
    lastUpdated,
    stateToast,
    error,
    refresh,
  };
}
