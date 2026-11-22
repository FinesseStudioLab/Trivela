import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useTransactionStatus, isTerminalStatus } from './useTransactionStatus';

describe('useTransactionStatus (#1485)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('correctly identifies terminal statuses', () => {
    expect(isTerminalStatus('confirmed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('success')).toBe(true);
    expect(isTerminalStatus('error')).toBe(true);
    expect(isTerminalStatus('SUCCESS')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('processing')).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });

  it('stops polling when a confirmed terminal status is received and makes no requests afterwards', async () => {
    let callCount = 0;
    const fetchStatusFn = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return { status: 'pending' };
      }
      return { status: 'confirmed' };
    });

    const onTerminal = vi.fn();

    const { result } = renderHook(() =>
      useTransactionStatus({
        hash: '0xabc123',
        pollIntervalMs: 3000,
        fetchStatusFn,
        onTerminal,
      }),
    );

    // Initial check (pending)
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('pending');
    expect(result.current.isPolling).toBe(true);
    expect(result.current.isTerminal).toBe(false);

    // Advance 3 seconds -> second poll returns 'confirmed' (terminal)
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('confirmed');
    expect(result.current.isPolling).toBe(false);
    expect(result.current.isTerminal).toBe(true);
    expect(onTerminal).toHaveBeenCalledWith('confirmed');

    // Advance time further (3s, 6s, 9s, 12s) - verify NO further requests are made
    await act(async () => {
      vi.advanceTimersByTime(12000);
      await Promise.resolve();
    });

    // Request count must remain strictly 2
    expect(fetchStatusFn).toHaveBeenCalledTimes(2);
  });

  it('stops polling when a failed terminal status is received and makes no further requests', async () => {
    let callCount = 0;
    const fetchStatusFn = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return { status: 'pending' };
      }
      return { status: 'failed' };
    });

    const { result } = renderHook(() =>
      useTransactionStatus({
        hash: '0xdeadbeef',
        pollIntervalMs: 3000,
        fetchStatusFn,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(1);

    // Advance by 3s -> returns failed
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('failed');
    expect(result.current.isPolling).toBe(false);

    // Advance time by another 15s
    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(2);
  });

  it('stops polling cleanly on unmount', async () => {
    const fetchStatusFn = vi.fn().mockResolvedValue({ status: 'pending' });

    const { unmount } = renderHook(() =>
      useTransactionStatus({
        hash: '0x1234',
        pollIntervalMs: 3000,
        fetchStatusFn,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(9000);
      await Promise.resolve();
    });

    expect(fetchStatusFn).toHaveBeenCalledTimes(1);
  });
});
