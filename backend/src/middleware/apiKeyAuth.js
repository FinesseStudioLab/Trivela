/**
 * Optional API key authentication middleware.
 *
 * If no keys are configured (env or database), the middleware is a no-op to
 * keep local development convenient.
 */

function parseApiKeys(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((key) => String(key).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

function normalizeApiKeys(value) {
  const keys = parseApiKeys(value);
  return [...new Set(keys)];
}

function readProvidedKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.trim()) {
    const match = authorization.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const queryKey = req.query?.api_key;
  if (typeof queryKey === 'string' && queryKey.trim()) {
    return queryKey.trim();
  }

  return '';
}

/**
 * @param {{
 *   apiKeys?: string | string[],
 *   apiKeyRepository?: {
 *     validate: (rawKey: string) => { id: string, label: string } | null,
 *     touchLastUsed: (id: string) => void,
 *     hasActiveKeys?: () => boolean,
 *   } | null,
 * }} [options]
 */
export default function createApiKeyAuth({
  apiKeys = process.env.TRIVELA_API_KEYS || process.env.TRIVELA_API_KEY || '',
  apiKeyRepository = null,
} = {}) {
  const allowedKeys = normalizeApiKeys(apiKeys);
  const allowedKeySet = new Set(allowedKeys);

  return function requireApiKey(req, res, next) {
    const authRequired = allowedKeySet.size > 0 || Boolean(apiKeyRepository?.hasActiveKeys?.());

    if (!authRequired) {
      return next();
    }

    const provided = readProvidedKey(req);

    if (provided && allowedKeySet.has(provided)) {
      req.auth = {
        type: 'apiKey',
        apiKey: String(provided),
        source: 'env',
      };
      return next();
    }

    if (provided && apiKeyRepository) {
      const match = apiKeyRepository.validate(provided);
      if (match) {
        apiKeyRepository.touchLastUsed(match.id);
        req.auth = {
          type: 'apiKey',
          apiKey: String(provided),
          source: 'database',
          apiKeyId: match.id,
          label: match.label,
        };
        return next();
      }
    }

    return res
      .status(401)
      .json({ error: 'Unauthorized – valid API key required.', code: 'UNAUTHORIZED' });
  };
}

/**
 * @param {{ masterKey?: string }} [options]
 */
export function createMasterKeyAuth({ masterKey = process.env.TRIVELA_MASTER_KEY || '' } = {}) {
  const normalizedMasterKey = String(masterKey).trim();

  return function requireMasterKey(req, res, next) {
    if (!normalizedMasterKey) {
      return res.status(503).json({
        error: 'Master API key management is not configured',
        code: 'MASTER_KEY_NOT_CONFIGURED',
      });
    }

    const provided = readProvidedKey(req);
    if (provided && provided === normalizedMasterKey) {
      req.auth = {
        type: 'masterKey',
        apiKey: provided,
      };
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized – master API key required.',
      code: 'UNAUTHORIZED',
    });
  };
}

export { readProvidedKey };
