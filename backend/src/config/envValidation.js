import { resolveStellarNetworkConfig } from './stellarNetwork.js';

function normalizePositiveInteger(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function parseCommaSeparated(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateCorsAllowedOrigins(value) {
  if (!value) {
    return;
  }

  const origins = parseCommaSeparated(value);
  if (origins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must include at least one origin when set');
  }

  if (origins.includes('*')) {
    return;
  }

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid origin: "${origin}"`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        `CORS_ALLOWED_ORIGINS origin must be http(s): "${origin}" (got ${parsed.protocol})`,
      );
    }
  }
}

function validateApiKeys({ apiKey, apiKeys }) {
  const raw = apiKeys || apiKey;
  if (!raw) {
    return;
  }

  const keys = Array.isArray(raw) ? raw : parseCommaSeparated(raw);
  if (keys.length === 0) {
    throw new Error('TRIVELA_API_KEYS must contain at least one key when set');
  }

  const trimmed = keys.map((key) => String(key).trim()).filter(Boolean);
  if (trimmed.length !== keys.length) {
    throw new Error('TRIVELA_API_KEYS contains an empty key (check for trailing commas)');
  }
}

export function validateBackendEnv(env = process.env) {
  const errors = [];

  const record = (fn) => {
    try {
      fn();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  };

  record(() => normalizePositiveInteger(env.PORT, 'PORT'));
  record(() => normalizePositiveInteger(env.RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS'));
  record(() => normalizePositiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_MAX_REQUESTS'));
  record(() => normalizePositiveInteger(env.SHORT_CACHE_TTL_MS, 'SHORT_CACHE_TTL_MS'));

  record(() =>
    resolveStellarNetworkConfig({
      network: env.STELLAR_NETWORK,
      sorobanRpcUrl: env.SOROBAN_RPC_URL,
      horizonUrl: env.HORIZON_URL,
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    }),
  );

  record(() => validateCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS ?? env.CORS_ORIGIN));
  record(() => validateApiKeys({ apiKey: env.TRIVELA_API_KEY, apiKeys: env.TRIVELA_API_KEYS }));

  if (env.DB_PATH && typeof env.DB_PATH !== 'string') {
    errors.push('DB_PATH must be a string path');
  }

  if (errors.length > 0) {
    const message = [
      'Invalid environment configuration:',
      ...errors.map((line) => `- ${line}`),
      '',
      'Fix the values and try again.',
    ].join('\n');

    throw new Error(message);
  }
}

