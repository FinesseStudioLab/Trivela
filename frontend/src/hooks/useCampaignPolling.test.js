import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignPolling } from './useCampaignPolling';

vi.mock('../config', () => ({
  apiUrl: (path) => `http://test.local${path}`,
  getPollIntervalMs: () => 1000,
}));

vi.mock('../stellar', () => ({
  fetchCampaignOnChainState: vi.fn(async () => ({
    isActive: true,
    isWithinWindow: true,
    participantCount: 3,
  })),
}));

describe('useCampaignPolling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('starts polling and loads campaign data', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Test', contractId: 'C123' }),
    });

    const { result } = renderHook(() =>
      useCampaignPolling({ campaignId: '1', contractId: 'C123', enabled: true }),
    );

    await waitFor(() => {
      expect(result.current.campaign?.name).toBe('Test');
    });

    expect(fetch).toHaveBeenCalled();
    expect(result.current.onChainState?.participantCount).toBe(3);
  });

  it('shows toast when on-chain state changes', async () => {
    const { fetchCampaignOnChainState } = await import('../stellar');

    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Test', contractId: 'C123' }),
    });

    fetchCampaignOnChainState
      .mockResolvedValueOnce({
        isActive: true,
        isWithinWindow: true,
        participantCount: 1,
      })
      .mockResolvedValueOnce({
        isActive: false,
        isWithinWindow: true,
        participantCount: 1,
      });

    const { result } = renderHook(() =>
      useCampaignPolling({ campaignId: '1', contractId: 'C123', enabled: true }),
    );

    await waitFor(() => expect(result.current.campaign).toBeTruthy());

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.stateToast).toBe('Campaign state updated');
    });
  });

  it('pauses polling while the tab is hidden', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Test' }),
    });

    const { result } = renderHook(() => useCampaignPolling({ campaignId: '1', enabled: true }));

    await waitFor(() => expect(result.current.campaign).toBeTruthy());

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(result.current.isPaused).toBe(true);
    });
  });
});
