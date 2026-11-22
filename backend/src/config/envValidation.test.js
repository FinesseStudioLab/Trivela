import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBackendEnv } from './envValidation.js';

test('an empty environment is valid', () => {
  assert.doesNotThrow(() => validateBackendEnv({}));
});

test('a well-formed configuration is valid', () => {
  assert.doesNotThrow(() =>
    validateBackendEnv({
      PORT: '3001',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_MAX_REQUESTS: '60',
      CORS_ALLOWED_ORIGINS: 'https://a.example.com, http://localhost:5173',
      TRIVELA_API_KEYS: 'key-one,key-two',
      LOCK_TTL_MS: '5000',
      EXPORT_RETENTION_DAYS: '30',
    }),
  );
});

test('numeric settings must be positive integers', () => {
  for (const bad of ['0', '-1', 'abc']) {
    assert.throws(() => validateBackendEnv({ PORT: bad }), /PORT must be a positive integer/, bad);
  }
  assert.throws(
    () => validateBackendEnv({ RATE_LIMIT_MAX_REQUESTS: '0' }),
    /RATE_LIMIT_MAX_REQUESTS/,
  );
  assert.throws(
    () => validateBackendEnv({ SOFT_DELETE_RETENTION_DAYS: 'x' }),
    /SOFT_DELETE_RETENTION_DAYS/,
  );
});

test('every problem is reported together in one error', () => {
  try {
    validateBackendEnv({ PORT: '0', LOCK_TTL_MS: 'x', EXPORT_RETENTION_DAYS: '-2' });
    assert.fail('expected a validation error');
  } catch (error) {
    assert.match(error.message, /Invalid environment configuration:/);
    assert.match(error.message, /- PORT must be a positive integer/);
    assert.match(error.message, /- LOCK_TTL_MS must be a positive integer/);
    assert.match(error.message, /- EXPORT_RETENTION_DAYS must be a positive integer/);
    assert.match(error.message, /Fix the values and try again\./);
  }
});

test('CORS origins must be valid http(s) URLs, with * allowed', () => {
  assert.doesNotThrow(() => validateBackendEnv({ CORS_ALLOWED_ORIGINS: '*' }));
  assert.doesNotThrow(() => validateBackendEnv({ CORS_ORIGIN: 'https://ok.example.com' }));
  assert.throws(() => validateBackendEnv({ CORS_ALLOWED_ORIGINS: 'not a url' }), /invalid origin/);
  assert.throws(
    () => validateBackendEnv({ CORS_ALLOWED_ORIGINS: 'ftp://files.example.com' }),
    /must be http\(s\)/,
  );
  assert.throws(() => validateBackendEnv({ CORS_ALLOWED_ORIGINS: ' , ' }), /at least one origin/);
});

test('API key lists tolerate stray commas but must contain at least one key', () => {
  assert.doesNotThrow(() => validateBackendEnv({ TRIVELA_API_KEY: 'solo' }));
  assert.doesNotThrow(() => validateBackendEnv({ TRIVELA_API_KEYS: 'a,,b,' }));
  assert.throws(() => validateBackendEnv({ TRIVELA_API_KEYS: ' , ' }), /at least one key/);
});

test('DB_PATH must be a string when set', () => {
  assert.throws(() => validateBackendEnv({ DB_PATH: 123 }), /DB_PATH must be a string path/);
  assert.doesNotThrow(() => validateBackendEnv({ DB_PATH: './trivela.db' }));
});
