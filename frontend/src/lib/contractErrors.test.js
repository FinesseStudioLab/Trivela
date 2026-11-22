import { describe, it, expect } from 'vitest';
import {
  getContractErrorMessage,
  getContractErrorInfo,
  extractContractErrorCode,
} from './contractErrors';

describe('contractErrors', () => {
  describe('getContractErrorMessage', () => {
    it('returns user-friendly message for known errors', () => {
      const msg = getContractErrorMessage(2);
      expect(msg).toBe('Insufficient points');
    });

    it('returns fallback message for unknown errors', () => {
      const msg = getContractErrorMessage(999);
      expect(msg).toContain('unexpected error');
    });
  });

  describe('getContractErrorInfo', () => {
    it('returns detailed error info', () => {
      const info = getContractErrorInfo(3);
      expect(info).toEqual({
        code: 'Unauthorized',
        message: 'You are not authorized to perform this action.',
        userMessage: 'Permission denied',
      });
    });

    it('returns unknown error object for unrecognized codes', () => {
      const info = getContractErrorInfo(999);
      expect(info.code).toBe('UnknownError');
    });
  });

  describe('extractContractErrorCode', () => {
    it('extracts code from error message', () => {
      const error = new Error('Host error: code: 2');
      const code = extractContractErrorCode(error);
      expect(code).toBe(2);
    });

    it('extracts code from different message format', () => {
      const error = new Error('Error code=4');
      const code = extractContractErrorCode(error);
      expect(code).toBe(4);
    });

    it('returns null for non-error objects', () => {
      const code = extractContractErrorCode(null);
      expect(code).toBeNull();
    });
  });
});
