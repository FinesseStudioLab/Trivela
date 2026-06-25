import { createHash } from 'node:crypto';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

function fingerprint(req) {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  return createHash('sha256').update(`${req.method}:${req.originalUrl}:${body}`).digest('hex');
}

export function createIdempotencyMiddleware({ repository, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!repository) {
    return (_req, _res, next) => next();
  }

  return async function idempotency(req, res, next) {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const key = req.headers[IDEMPOTENCY_HEADER.toLowerCase()];
    if (!key) {
      return next();
    }

    if (typeof key !== 'string' || key.length < 8 || key.length > 256) {
      return res.status(400).json({
        error: 'Invalid Idempotency-Key format (8-256 characters required)',
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
    }

    const fp = fingerprint(req);
    const existing = repository.find(key);

    if (existing) {
      if (existing.completed_at) {
        const expired = new Date(existing.expires_at) < new Date();
        if (expired) {
          repository.cleanup();
          return next();
        }
        if (existing.request_fingerprint !== fp) {
          return res.status(422).json({
            error: 'Idempotency-Key reused with different request payload',
            code: 'IDEMPOTENCY_KEY_MISMATCH',
          });
        }
        res.setHeader('Idempotent-Previous-Request', 'true');
        return res.status(existing.status_code).json(JSON.parse(existing.response_body));
      }

      if (existing.locked_at) {
        return res.status(409).json({
          error: 'Request already in progress',
          code: 'IDEMPOTENCY_IN_PROGRESS',
        });
      }
    }

    if (!existing) {
      repository.create(key, fp);
    }

    const locked = repository.tryLock(key);
    if (!locked) {
      return res.status(409).json({
        error: 'Request already in progress',
        code: 'IDEMPOTENCY_IN_PROGRESS',
      });
    }

    const originalJson = res.json.bind(res);
    res.json = function interceptJson(body) {
      const statusCode = res.statusCode || 200;
      try {
        repository.complete(key, statusCode, JSON.stringify(body));
      } catch (err) {
        req.log?.warn?.({ err }, 'Failed to persist idempotency response');
      }
      return originalJson(body);
    };

    next();
  };
}
