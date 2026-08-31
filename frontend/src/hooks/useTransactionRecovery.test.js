import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTransactionRecovery } from './useTransactionRecovery';
import { RECOVERY_ACTION } from '../lib/errorMapping';

describe('useTransactionRecovery', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  describe('getExplorerUrl', () => {
    it('builds a testnet transaction URL from a hash', () => {
      const { result } = renderHook(() =>
        useTransactionRecovery({ network: 'testnet', hash: 'abc123' }),
      );
      expect(result.current.getExplorerUrl('abc123')).toBe(
        'https://stellar.expert/explorer/testnet/tx/abc123',
      );
    });

    it('uses the mainnet network when specified', () => {
      const { result } = renderHook(() =>
        useTransactionRecovery({ network: 'mainnet', hash: 'xyz' }),
      );
      expect(result.current.getExplorerUrl('xyz')).toBe(
        'https://stellar.expert/explorer/mainnet/tx/xyz',
      );
    });

    it('falls back to the hook-level hash when no argument is passed', () => {
      const { result } = renderHook(() =>
        useTransactionRecovery({ network: 'testnet', hash: 'defaulthash' }),
      );
      expect(result.current.getExplorerUrl()).toBe(
        'https://stellar.expert/explorer/testnet/tx/defaulthash',
      );
    });

    it('returns base explorer URL when no hash is available', () => {
      const { result } = renderHook(() => useTransactionRecovery({ network: 'testnet' }));
      expect(result.current.getExplorerUrl()).toBe('https://stellar.expert/explorer/testnet');
    });
  });

  describe('getReportUrl', () => {
    it('includes the error code in the issue title', () => {
      const { result } = renderHook(() => useTransactionRecovery());
      const url = result.current.getReportUrl(102);
      expect(url).toContain('title=Transaction+error+%28code+102%29');
      expect(url).toContain('labels=bug');
    });

    it('omits the code suffix when no code is provided', () => {
      const { result } = renderHook(() => useTransactionRecovery());
      const url = result.current.getReportUrl(null);
      expect(url).toContain('title=Transaction+error');
      expect(url).not.toContain('code');
    });
  });

  describe('handlers', () => {
    it('exposes a handler for every RECOVERY_ACTION value', () => {
      const { result } = renderHook(() => useTransactionRecovery());
      Object.values(RECOVERY_ACTION).forEach((action) => {
        expect(typeof result.current.handlers[action]).toBe('function');
      });
    });

    it('calls onRetry for the RETRY handler', () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() => useTransactionRecovery({ onRetry }));
      act(() => result.current.handlers[RECOVERY_ACTION.RETRY]());
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry for the RE_SIGN handler (same action, different label)', () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() => useTransactionRecovery({ onRetry }));
      act(() => result.current.handlers[RECOVERY_ACTION.RE_SIGN]());
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('calls onSwitchWallet for the SWITCH_WALLET handler', () => {
      const onSwitchWallet = vi.fn();
      const { result } = renderHook(() => useTransactionRecovery({ onSwitchWallet }));
      act(() => result.current.handlers[RECOVERY_ACTION.SWITCH_WALLET]());
      expect(onSwitchWallet).toHaveBeenCalledTimes(1);
    });

    it('calls onTopUp for the TOP_UP handler', () => {
      const onTopUp = vi.fn();
      const { result } = renderHook(() => useTransactionRecovery({ onTopUp }));
      act(() => result.current.handlers[RECOVERY_ACTION.TOP_UP]());
      expect(onTopUp).toHaveBeenCalledTimes(1);
    });

    it('opens explorer in new tab for the VIEW_EXPLORER handler', () => {
      const { result } = renderHook(() =>
        useTransactionRecovery({ network: 'testnet', hash: 'abc' }),
      );
      act(() => result.current.handlers[RECOVERY_ACTION.VIEW_EXPLORER]());
      expect(window.open).toHaveBeenCalledWith(
        'https://stellar.expert/explorer/testnet/tx/abc',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('opens GitHub issues for the REPORT handler', () => {
      const { result } = renderHook(() => useTransactionRecovery());
      act(() => result.current.handlers[RECOVERY_ACTION.REPORT](103));
      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('github.com'),
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('does not throw when optional callbacks are not provided', () => {
      const { result } = renderHook(() => useTransactionRecovery());
      expect(() => {
        act(() => {
          result.current.handlers[RECOVERY_ACTION.RETRY]();
          result.current.handlers[RECOVERY_ACTION.RE_SIGN]();
          result.current.handlers[RECOVERY_ACTION.SWITCH_WALLET]();
          result.current.handlers[RECOVERY_ACTION.TOP_UP]();
        });
      }).not.toThrow();
    });
  });
});
