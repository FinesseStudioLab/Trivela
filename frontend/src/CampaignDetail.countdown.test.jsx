import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignCountdown } from './CampaignDetail';

// Unit tests for the countdown timer logic (issue #317's acceptance
// criterion: "Add unit tests for the countdown timer logic and on-chain
// state display"). windowStart/windowEnd are unix seconds, matching
// contracts/campaign/src/lib.rs's get_window() -> (u64, u64).

describe('useCampaignCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports "unbounded" when no window is configured', () => {
    const { result } = renderHook(() => useCampaignCountdown(null, null));
    expect(result.current.phase).toBe('unbounded');
    expect(result.current.label).toBeNull();
  });

  it('reports time remaining when the window is currently active', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const start = nowSec - 3600; // started 1h ago
    const end = nowSec + 2 * 86400 + 4 * 3600 + 15 * 60; // ~2d 4h 15m remaining

    const { result } = renderHook(() => useCampaignCountdown(start, end));
    expect(result.current.phase).toBe('active');
    expect(result.current.label).toBe('Ends in 2d 4h 15m');
  });

  it('reports a starting countdown when the window has not started yet', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const start = nowSec + 3600; // starts in 1h
    const end = nowSec + 86400;

    const { result } = renderHook(() => useCampaignCountdown(start, end));
    expect(result.current.phase).toBe('upcoming');
    expect(result.current.label).toBe('Starts in 1h 0m');
  });

  it('reports the window as closed once end has passed', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const start = nowSec - 2 * 86400;
    const end = nowSec - 3600; // ended 1h ago

    const { result } = renderHook(() => useCampaignCountdown(start, end));
    expect(result.current.phase).toBe('ended');
    expect(result.current.label).toBe('Window closed');
  });

  it('ticks the label down as time passes', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const start = nowSec - 60;
    const end = nowSec + 120; // 2 minutes remaining

    const { result } = renderHook(() => useCampaignCountdown(start, end));
    expect(result.current.label).toBe('Ends in 2m');

    act(() => {
      vi.advanceTimersByTime(61_000); // advance just past 1 minute
    });

    expect(result.current.label).toBe('Ends in 1m');
  });

  it('does not start a ticking interval when no window is configured', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    renderHook(() => useCampaignCountdown(null, null));
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
