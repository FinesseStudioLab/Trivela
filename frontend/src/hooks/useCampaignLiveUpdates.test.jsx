// Tests for the composed live-updates hook (#626): pure-polling fallback when
// no stream is configured, and going live + reconciling on events.

import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignLiveUpdates } from './useCampaignLiveUpdates';

vi.mock('../config', () => ({
  apiUrl: (path) => `http://test.local${path}`,
  getPollIntervalMs: () => 1000,
  getRealtimeUrl: () => '',
}));

vi.mock('../stellar', () => ({
  fetchCampaignOnChainState: vi.fn(async () => ({
    isActive: true,
    isWithinWindow: true,
    participantCount: 3,
  })),
}));

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.({});
  }

  message(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useCampaignLiveUpdates', () => {
  it('falls back to pure polling when no stream is configured', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Polled', contractId: 'C1' }),
    });

    const { result } = renderHook(() => useCampaignLiveUpdates({ campaignId: '1' }));

    await waitFor(() => expect(result.current.campaign?.name).toBe('Polled'));
    expect(result.current.realtimeEnabled).toBe(false);
    expect(result.current.isLive).toBe(false);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('goes live on connect and reconciles on each event', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Live', contractId: 'C1', participantCount: 1 }),
    });

    const { result } = renderHook(() =>
      useCampaignLiveUpdates({
        campaignId: '1',
        realtimeUrl: 'http://stream.local/1',
        eventSourceImpl: MockEventSource,
      }),
    );

    // Baseline load happens before the stream is live.
    await waitFor(() => expect(result.current.campaign?.name).toBe('Live'));
    expect(result.current.realtimeEnabled).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);

    // Stream opens → live.
    act(() => MockEventSource.instances[0].open());
    await waitFor(() => expect(result.current.isLive).toBe(true));
    expect(result.current.connectionStatus).toBe('open');

    // A live event triggers a reconcile (refresh) against the source of truth.
    const callsBefore = fetch.mock.calls.length;
    await act(async () => {
      MockEventSource.instances[0].message({ id: 'e1', data: { participantCount: 9 } });
    });
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(result.current.liveUpdatedAt).toBeInstanceOf(Date);
  });
});
