import { describe, it, expect } from 'vitest';
import {
  ERROR_CLASS,
  RECOVERY_ACTION,
  classifyError,
  extractErrorCode,
  mapError,
  getRecoveryActions,
  getErrorMessage,
  isRetryableError,
} from './errorMapping';

// ── extractErrorCode ──────────────────────────────────────────────────────────

describe('extractErrorCode', () => {
  it('returns a bare number directly', () => {
    expect(extractErrorCode(503)).toBe(503);
  });

  it('parses a contract revert string', () => {
    expect(extractErrorCode('Error(Contract, #102)')).toBe(102);
  });

  it('reads .code from an object', () => {
    expect(extractErrorCode({ code: 429 })).toBe(429);
  });

  it('reads .status from an object', () => {
    expect(extractErrorCode({ status: 401 })).toBe(401);
  });

  it('returns null for null / undefined', () => {
    expect(extractErrorCode(null)).toBeNull();
    expect(extractErrorCode(undefined)).toBeNull();
  });
});

// ── classifyError ─────────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('classifies a contract revert string as CONTRACT', () => {
    expect(classifyError('Error(Contract, #103)')).toBe(ERROR_CLASS.CONTRACT);
  });

  it('classifies user-rejected wallet errors as WALLET', () => {
    expect(classifyError(new Error('User rejected the request'))).toBe(ERROR_CLASS.WALLET);
    expect(classifyError(new Error('Freighter: user declined'))).toBe(ERROR_CLASS.WALLET);
  });

  it('classifies network failures as NETWORK', () => {
    expect(classifyError(new Error('Failed to fetch'))).toBe(ERROR_CLASS.NETWORK);
    expect(classifyError(new Error('NetworkError when attempting to fetch resource'))).toBe(
      ERROR_CLASS.NETWORK,
    );
  });

  it('classifies RPC / Soroban errors as RPC', () => {
    expect(classifyError(new Error('Soroban simulate failed'))).toBe(ERROR_CLASS.RPC);
    expect(classifyError(new Error('503 Service Unavailable from Horizon'))).toBe(ERROR_CLASS.RPC);
  });

  it('classifies validation errors as VALIDATION', () => {
    expect(classifyError(new Error('Amount must be a number'))).toBe(ERROR_CLASS.VALIDATION);
  });

  it('classifies bare numeric contract codes as CONTRACT', () => {
    expect(classifyError(102)).toBe(ERROR_CLASS.CONTRACT);
  });

  it('returns UNKNOWN for empty / unrecognised errors', () => {
    expect(classifyError(null)).toBe(ERROR_CLASS.UNKNOWN);
    expect(classifyError(new Error('something weird happened'))).toBe(ERROR_CLASS.UNKNOWN);
  });
});

// ── getRecoveryActions ────────────────────────────────────────────────────────

describe('getRecoveryActions', () => {
  it('returns TOP_UP for code 2 (insufficient balance)', () => {
    expect(getRecoveryActions(ERROR_CLASS.CONTRACT, 2)).toEqual([RECOVERY_ACTION.TOP_UP]);
  });

  it('returns SWITCH_WALLET for code 100 (permission denied)', () => {
    expect(getRecoveryActions(ERROR_CLASS.CONTRACT, 100)).toEqual([RECOVERY_ACTION.SWITCH_WALLET]);
  });

  it('returns SWITCH_WALLET for code 104 (not eligible)', () => {
    expect(getRecoveryActions(ERROR_CLASS.CONTRACT, 104)).toEqual([RECOVERY_ACTION.SWITCH_WALLET]);
  });

  it('returns RETRY for code 105 (already processed)', () => {
    expect(getRecoveryActions(ERROR_CLASS.CONTRACT, 105)).toEqual([RECOVERY_ACTION.RETRY]);
  });

  it('returns VIEW_EXPLORER for code 101 (campaign not open)', () => {
    expect(getRecoveryActions(ERROR_CLASS.CONTRACT, 101)).toEqual([RECOVERY_ACTION.VIEW_EXPLORER]);
  });

  it('falls back to class default when no code override exists', () => {
    expect(getRecoveryActions(ERROR_CLASS.WALLET, null)).toEqual([RECOVERY_ACTION.RE_SIGN]);
    expect(getRecoveryActions(ERROR_CLASS.NETWORK, null)).toEqual([RECOVERY_ACTION.RETRY]);
    expect(getRecoveryActions(ERROR_CLASS.RPC, null)).toEqual([RECOVERY_ACTION.RETRY]);
    expect(getRecoveryActions(ERROR_CLASS.UNKNOWN, null)).toEqual([
      RECOVERY_ACTION.RETRY,
      RECOVERY_ACTION.REPORT,
    ]);
  });

  it('returns empty array for VALIDATION errors', () => {
    expect(getRecoveryActions(ERROR_CLASS.VALIDATION, null)).toEqual([]);
  });

  it('returns VIEW_EXPLORER for contract errors without a code override', () => {
    expect(getRecoveryActions(ERROR_CLASS.CONTRACT, null)).toEqual([RECOVERY_ACTION.VIEW_EXPLORER]);
  });
});

// ── mapError ──────────────────────────────────────────────────────────────────

describe('mapError', () => {
  it('maps a contract revert with a known code', () => {
    const result = mapError('Error(Contract, #102)');
    expect(result.class).toBe(ERROR_CLASS.CONTRACT);
    expect(result.code).toBe(102);
    expect(result.message).toContain('participant limit');
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.VIEW_EXPLORER]);
    expect(result.retryable).toBe(false);
  });

  it('maps an insufficient-balance error (code 2) with TOP_UP action', () => {
    const result = mapError({ code: 2, message: 'Error(Contract, #2)' });
    expect(result.class).toBe(ERROR_CLASS.CONTRACT);
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.TOP_UP]);
  });

  it('maps a user-rejected wallet error with RE_SIGN action', () => {
    const result = mapError(new Error('User rejected the request'));
    expect(result.class).toBe(ERROR_CLASS.WALLET);
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.RE_SIGN]);
    expect(result.retryable).toBe(false);
  });

  it('maps a network failure with RETRY action and marks retryable', () => {
    const result = mapError(new Error('Failed to fetch'));
    expect(result.class).toBe(ERROR_CLASS.NETWORK);
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.RETRY]);
    expect(result.retryable).toBe(true);
  });

  it('maps an RPC error with RETRY action and marks retryable', () => {
    // Use a message that matches the RPC pattern without triggering the
    // NETWORK pattern ("timed out" would be caught by NETWORK first).
    const result = mapError(new Error('Soroban simulate call failed'));
    expect(result.class).toBe(ERROR_CLASS.RPC);
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.RETRY]);
    expect(result.retryable).toBe(true);
  });

  it('maps an unknown error with RETRY + REPORT', () => {
    const result = mapError(new Error('something completely unexpected'));
    expect(result.class).toBe(ERROR_CLASS.UNKNOWN);
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.RETRY, RECOVERY_ACTION.REPORT]);
  });

  it('maps a permission error (code 100) with SWITCH_WALLET', () => {
    const result = mapError('Error(Contract, #100)');
    expect(result.recoveryActions).toEqual([RECOVERY_ACTION.SWITCH_WALLET]);
  });

  it('always includes class, code, message, recoveryActions, retryable', () => {
    const result = mapError(null);
    expect(result).toHaveProperty('class');
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('recoveryActions');
    expect(result).toHaveProperty('retryable');
  });
});

// ── getErrorMessage ───────────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('returns the mapped message for a known code', () => {
    expect(getErrorMessage(102)).toContain('participant limit');
  });

  it('falls back gracefully for an unmapped code', () => {
    expect(getErrorMessage(9999)).toBe('An unexpected error occurred');
  });

  it('returns the error .message as fallback', () => {
    expect(getErrorMessage(new Error('custom error text'))).toBe('custom error text');
  });
});

// ── isRetryableError ──────────────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('marks 503 as retryable', () => {
    expect(isRetryableError(503)).toBe(true);
  });

  it('does not mark a contract-state error as retryable', () => {
    expect(isRetryableError(101)).toBe(false);
  });
});
