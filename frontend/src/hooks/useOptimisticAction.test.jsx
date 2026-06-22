// Tests for the optimistic-action lifecycle hook and the error classification
// that powers register/claim's rollback messaging (#627).
//
// Located under src/hooks/ to match the vitest `include` glob
// (src/hooks/**/*.test.{js,jsx}) so it runs in CI.

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useOptimisticAction } from './useOptimisticAction';
import { classifyError, mapError, ERROR_CLASS } from '../lib/errorMapping';

describe('useOptimisticAction', () => {
  it('applies the optimistic update, then reconciles on success', async () => {
    const { result } = renderHook(() => useOptimisticAction());
    const optimistic = vi.fn();
    const reconcile = vi.fn();
    const rollback = vi.fn();

    await act(async () => {
      const outcome = await result.current.run(async () => 'BALANCE_42', {
        optimistic,
        rollback,
        reconcile,
      });
      expect(outcome).toEqual({ ok: true, result: 'BALANCE_42' });
    });

    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith('BALANCE_42');
    expect(rollback).not.toHaveBeenCalled();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('rolls back and surfaces a mapped error on failure', async () => {
    const { result } = renderHook(() => useOptimisticAction());
    const optimistic = vi.fn();
    const rollback = vi.fn();
    const reconcile = vi.fn();

    await act(async () => {
      const outcome = await result.current.run(
        async () => {
          throw new Error('Error(Contract, #103)');
        },
        { optimistic, rollback, reconcile },
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.error.class).toBe(ERROR_CLASS.CONTRACT);
    });

    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(reconcile).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(true);
    expect(result.current.error.code).toBe(103);
    expect(result.current.error.message).toMatch(/not active/i);
  });

  it('does not roll back if the failure happens before the optimistic step', async () => {
    const { result } = renderHook(() => useOptimisticAction());
    const rollback = vi.fn();

    await act(async () => {
      await result.current.run(
        async () => {
          throw new Error('boom');
        },
        {
          optimistic: () => {
            throw new Error('optimistic failed');
          },
          rollback,
        },
      );
    });

    // The optimistic callback threw, so nothing was applied → nothing to undo.
    expect(rollback).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(true);
  });

  it('ignores a second submit while one is in flight (double-submit guard)', async () => {
    const { result } = renderHook(() => useOptimisticAction());

    let resolveFirst;
    const action = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    let firstPromise;
    act(() => {
      firstPromise = result.current.run(action);
    });
    expect(result.current.isPending).toBe(true);

    // Second call while pending must be skipped and must not invoke the action.
    await act(async () => {
      const second = await result.current.run(action);
      expect(second).toEqual({ ok: false, skipped: true });
    });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst('ok');
      await firstPromise;
    });
    expect(result.current.isSuccess).toBe(true);

    // After settling, a fresh submit is allowed again.
    await act(async () => {
      await result.current.run(async () => 'again');
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('reset returns the hook to its idle state', async () => {
    const { result } = renderHook(() => useOptimisticAction());

    await act(async () => {
      await result.current.run(async () => {
        throw new Error('nope');
      });
    });
    expect(result.current.isError).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});

describe('error classification (distinct messaging)', () => {
  it('classifies a contract revert by its decoded code', () => {
    expect(classifyError(new Error('HostError: Error(Contract, #102)'))).toBe(ERROR_CLASS.CONTRACT);
    const mapped = mapError(new Error('Error(Contract, #102)'));
    expect(mapped.code).toBe(102);
    expect(mapped.message).toMatch(/participant limit/i);
  });

  it('classifies a wallet rejection separately from a system failure', () => {
    expect(classifyError(new Error('User declined the transaction in Freighter'))).toBe(
      ERROR_CLASS.WALLET,
    );
    expect(mapError(new Error('User rejected request')).message).toMatch(/cancelled/i);
  });

  it('distinguishes network failures from contract reverts', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe(ERROR_CLASS.NETWORK);
    const net = mapError(new Error('network timeout while submitting'));
    expect(net.class).toBe(ERROR_CLASS.NETWORK);
    expect(net.retryable).toBe(true);
    expect(net.message).toMatch(/not submitted/i);
  });

  it('classifies RPC/Horizon outages as their own class', () => {
    const rpc = mapError(new Error('Soroban RPC simulate failed: 503 service unavailable'));
    expect(rpc.class).toBe(ERROR_CLASS.RPC);
    expect(rpc.retryable).toBe(true);
    expect(rpc.message).toMatch(/temporarily unavailable/i);
  });
});
