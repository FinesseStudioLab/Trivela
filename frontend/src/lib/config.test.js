// src/lib/config.test.js
import { describe, it, expect } from 'vitest';
import { getApiUrl } from './config';

describe('config', () => {
  it('returns default when env is missing', () => {
    const original = process.env.API_URL;
    delete process.env.API_URL;

    expect(getApiUrl()).toBe('http://localhost:3000');

    process.env.API_URL = original;
  });
});
