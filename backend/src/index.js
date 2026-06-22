/**
 * Trivela Backend API
 * Serves campaign data, health, and Stellar/Soroban RPC proxy for the frontend.
 */

// #288 — OpenTelemetry SDK MUST initialize before any `http` /
// `express` import so the auto-instrumentation patches catch them.
// `initTracing()` is fire-and-forget; the API/SDK still works as a
// no-op when the optional OTel deps aren't installed.
import { initTracing, traceparentMiddleware, shutdownTracing } from './tracing.js';
void initTracing();

import cors from 'cors';
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Redis from 'ioredis';
import createApiKeyAuth, { createMasterKeyAuth } from './middleware/apiKeyAuth.js';
import { createRateLimiter, createRedisStore } from './middleware/rateLimit.js';
import { createAuthLockout } from './middleware/authLockout.js';
import requestLogger, { log } from './middleware/logger.js';
import requestId from './middleware/requestId.js';
import securityHeaders from './middleware/securityHeaders.js';
import errorHandler from './middleware/errorHandler.js';
import { paginateItems } from './pagination.js';
import { checkSorobanRpcHealth } from './sorobanRpc.js';
import { createRpcPool } from './rpcPool.js';
import { resolveStellarNetworkConfig } from './config/stellarNetwork.js';
import { validateBackendEnv } from './config/envValidation.js';
import { createDal } from './dal/index.js';
import { createJobRunner } from './jobs/jobRunner.js';
import { WebhookService, WEBHOOK_EVENTS } from './services/webhookService.js';
import {
  campaignCreateSchema,
  campaignUpdateSchema,
  cursorBodySchema,
  apiKeyCreateSchema,
  formatZodErrors,
} from './schemas.js';
import { createStorageAdapter } from './storage/index.js';
import {
  uploadCampaignImage,
  validateImageUpload,
  MAX_IMAGE_SIZE_BYTES,
} from './services/imageUpload.js';
import { buildCampaignStats } from './services/campaignStatsService.js';
import { generateAllowlist } from './lib/allowlist/merkle.js';
import { parseAllowlistCsv, validateGAddress, MAX_ALLOWLIST_ROWS } from './lib/allowlist/csv.js';
import { createEmbedRoute } from './routes/embed.js';
import { createVariantRoutes } from './routes/variants.js';
import { createVariantService } from './services/variantService.js';
import { createCohortRoutes } from './routes/cohorts.js';
import { createCohortService } from './services/cohortService.js';
import { createPushRoutes } from './routes/push.js';
import { createWebPushService } from './services/webPushService.js';
import { requestTimeout } from './middleware/timeout.js';
import { PoolSaturatedError } from './rpcPool.js';

const DEFAULT_PORT = 3001;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;
const DEFAULT_AUTH_LOCKOUT_SOFT_THRESHOLD = 5;
const DEFAULT_AUTH_LOCKOUT_HARD_THRESHOLD = 10;
const DEFAULT_AUTH_LOCKOUT_BASE_LOCKOUT_MS = 60_000;
const DEFAULT_SHORT_CACHE_TTL_MS = 5_000;
const DEFAULT_JSON_BODY_LIMIT = '100kb';
const DEFAULT_RPC_POLL_INTERVAL_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const LEGACY_API_PREFIX = '/api';
const API_V1_PREFIX = '/api/v1';
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

/**
 * @param {string | number | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** @returns {{ name: string, description: string, active: boolean, rewardPerAction: number, createdAt: string }[]} */
function defaultSeed() {
  return [
    {
      name: 'Welcome Campaign',
      description: 'Earn points for completing onboarding',
      active: true,
      rewardPerAction: 10,
      createdAt: new Date().toISOString(),
    },
  ];
}

/** @param {string | undefined} value @returns {string[]} */
function parseAllowedOrigins(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** @param {string[]} allowedOrigins @returns {import('cors').CorsOptions} */
function createCorsOptions(allowedOrigins) {
  const corsOptions = {
    maxAge: 86400,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    // #288 — accept `traceparent` from instrumented frontends and
    // expose it on responses so the browser can stitch its own
    // spans into the same OpenTelemetry trace.
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'traceparent'],
    exposedHeaders: ['traceparent'],
  };

  if (allowedOrigins.includes('*')) {
    return { origin: true, ...corsOptions };
  }

  return {
    origin(
      /** @type {string | undefined} */ origin,
      /** @type {(err: Error | null, allow?: boolean) => void} */ callback,
    ) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    ...corsOptions,
  };
}

/** @param {Record<string, unknown>} options @param {string} envKey @returns {string} */
function readOptionalConfigValue(options, envKey) {
  const fromOptions = options[envKey];
  if (typeof fromOptions === 'string' && fromOptions.trim().length > 0) {
    return fromOptions;
  }

  const fromEnv = process.env[envKey];
  return typeof fromEnv === 'string' ? fromEnv : '';
}

/** @param {unknown} value @param {string} label @returns {string} */
function validateContractId(value, label) {
  if (!value) {
    return '';
  }
  const normalized = String(value).trim();
  if (!CONTRACT_ID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid Stellar contract ID`);
  }
  return normalized;
}

/** @param {Record<string, unknown>} options @returns {import('express').Application} */
export async function createApp(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const jsonBodyLimit =
    /** @type {string} */ (options.jsonBodyLimit) ??
    process.env.JSON_BODY_LIMIT ??
    DEFAULT_JSON_BODY_LIMIT;
  const corsAllowedOriginsRaw =
    /** @type {string | undefined} */ (options.corsAllowedOrigins) ??
    process.env.CORS_ALLOWED_ORIGINS ??
    process.env.CORS_ORIGIN ??
    (isProduction ? '' : 'http://localhost:5173');
  const stellarConfig = resolveStellarNetworkConfig({
    network: /** @type {string} */ (options.stellarNetwork) ?? process.env.STELLAR_NETWORK,
    sorobanRpcUrl: /** @type {string} */ (options.sorobanRpcUrl) ?? process.env.SOROBAN_RPC_URL,
    horizonUrl: /** @type {string} */ (options.horizonUrl) ?? process.env.HORIZON_URL,
    networkPassphrase:
      /** @type {string} */ (options.networkPassphrase) ?? process.env.STELLAR_NETWORK_PASSPHRASE,
  });
  const rewardsContractId = validateContractId(
    readOptionalConfigValue(options, 'REWARDS_CONTRACT_ID'),
    'REWARDS_CONTRACT_ID',
  );
  const campaignContractId = validateContractId(
    readOptionalConfigValue(options, 'CAMPAIGN_CONTRACT_ID'),
    'CAMPAIGN_CONTRACT_ID',
  );
  const fetchImpl = /** @type {typeof fetch} */ (options.fetchImpl) ?? globalThis.fetch;
  const rpcUrlsRaw =
    /** @type {string | undefined} */ (options.sorobanRpcUrls) ?? process.env.SOROBAN_RPC_URLS;
  const rpcUrls = rpcUrlsRaw
    ? String(rpcUrlsRaw)
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    : [stellarConfig.sorobanRpcUrl];
  const rpcPool = createRpcPool(rpcUrls);
  const allowedOrigins = parseAllowedOrigins(corsAllowedOriginsRaw);

  if (isProduction && allowedOrigins.includes('*')) {
    throw new Error('Wildcard origins are not permitted in production.');
  }

  const rateLimitWindowMs = normalizePositiveInteger(
    /** @type {any} */ (options.rateLimit)?.windowMs ?? process.env.RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
  );
  const rateLimitMaxRequests = normalizePositiveInteger(
    /** @type {any} */ (options.rateLimit)?.maxRequests ?? process.env.RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  );

  const authLockoutOptions = /** @type {any} */ (options.authLockout) ?? {};
  const authLockoutSoftThreshold = normalizePositiveInteger(
    authLockoutOptions.softThreshold ?? process.env.AUTH_LOCKOUT_SOFT_THRESHOLD,
    DEFAULT_AUTH_LOCKOUT_SOFT_THRESHOLD,
  );
  const authLockoutHardThreshold = normalizePositiveInteger(
    authLockoutOptions.hardThreshold ?? process.env.AUTH_LOCKOUT_HARD_THRESHOLD,
    DEFAULT_AUTH_LOCKOUT_HARD_THRESHOLD,
  );
  const authLockoutBaseMs = normalizePositiveInteger(
    authLockoutOptions.baseLockoutMs ?? process.env.AUTH_LOCKOUT_BASE_MS,
    DEFAULT_AUTH_LOCKOUT_BASE_LOCKOUT_MS,
  );

  const seed = /** @type {any[]} */ (options.campaigns) ?? defaultSeed();
  const dbPath = /** @type {string} */ (options.dbPath) ?? process.env.DB_PATH ?? './trivela.db';
  const dal = await createDal({
    dbPath,
    campaigns: seed,
    campaignRepository: options.campaignRepository,
    auditLogRepository: options.auditLogRepository,
  });
  const campaignRepository = dal.campaigns;
  const auditLogRepository = dal.auditLogs;
  const webhookRepository = dal.webhooks;
  const referralRepository = dal.referrals;
  const variantRepository = dal.variants;
  const cohortRepository = dal.cohorts;
  const pushSubscriptionRepository = dal.pushSubscriptions;
  const apiKeyRepository = dal.apiKeys;
  const failedJobRepository = options.failedJobRepository ?? dal.failedJobs;
  const allowlistRepository = dal.allowlists;

  const storageAdapter = /** @type {import('./storage/storageAdapter.js').StorageAdapter} */ (
    options.storageAdapter ?? createStorageAdapter(process.env)
  );
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  });
  const webhookService = new WebhookService(webhookRepository, {
    fetchImpl,
    logger: log,
  });
  const variantService = createVariantService({ variantRepo: variantRepository });
  const cohortService = createCohortService({ cohortRepo: cohortRepository });
  const webPushService = createWebPushService({
    repository: pushSubscriptionRepository,
    vapid: {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT,
    },
    logger: log,
  });
  const shortCacheTtlMs = normalizePositiveInteger(
    /** @type {any} */ (options.shortCacheTtlMs) ?? process.env.SHORT_CACHE_TTL_MS,
    DEFAULT_SHORT_CACHE_TTL_MS,
  );
  const rpcPollIntervalMs = normalizePositiveInteger(
    /** @type {any} */ (options.rpcPollIntervalMs) ?? process.env.RPC_HEALTH_POLL_INTERVAL_MS,
    DEFAULT_RPC_POLL_INTERVAL_MS,
  );
  const shortCache = new Map();
  const indexerCursorState = {
    cursor:
      /** @type {string | null} */ (options.initialIndexerCursor) ??
      process.env.INDEXER_EVENT_CURSOR ??
      null,
    updatedAt: new Date().toISOString(),
    source: (options.initialIndexerCursor ?? process.env.INDEXER_EVENT_CURSOR) ? 'env' : 'runtime',
  };
  const rpcHealthCache = {
    updatedAt: /** @type {string | null} */ (null),
    payload: /** @type {unknown} */ (null),
  };

  const app = express();
  const metrics = {
    requestTotal: 0,
    requestErrors: 0,
    routeHits: new Map(),
    authFailures: 0,
    authLockouts: 0,
    // p95 latency histogram — 12 buckets (ms): 50,100,200,500,1000,2000,5000,...
    latencyBuckets: [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, Infinity],
    latencyCounts: /** @type {number[]} */ ([]),
    latencyTotal: 0,
    latencySum: 0,
  };
  // Initialise bucket counters to 0.
  metrics.latencyCounts = metrics.latencyBuckets.map(() => 0);

  // Apply global request deadline so every route self-defends against slow
  // upstreams.  The timeout is configurable via REQUEST_TIMEOUT_MS.
  const requestTimeoutMs = normalizePositiveInteger(
    options.requestTimeoutMs ?? process.env.REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  app.use(requestTimeout(requestTimeoutMs));

  /**
   * Compatibility shim: ?api_version=v0 rewrites v1 routes to legacy patterns
   * and adds a Deprecation header. This is a temporary bridge for integrators
   * during the 90-day migration window (see docs/API_MIGRATION.md).
   */
  app.use((req, res, next) => {
    if (req.query.api_version === 'v0') {
      // Rewrite /api/v1/* → /api/* for route matching
      req.url = req.url.replace(/^\/api\/v1/, '/api');
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', 'Sat, 01 Jul 2026 00:00:00 GMT');
    }
    next();
  });

  // Brute-force / credential-stuffing guard (#588). Runs immediately before the
  // auth middleware on every protected route; a spike in failures/lockouts is
  // surfaced via the trivela_auth_* counters and structured warn logs.
  const authGuard = createAuthLockout({
    softThreshold: authLockoutSoftThreshold,
    hardThreshold: authLockoutHardThreshold,
    baseLockoutMs: authLockoutBaseMs,
    timeProvider: authLockoutOptions.timeProvider,
    delayFn: authLockoutOptions.delayFn,
    store: authLockoutOptions.store,
    onFailure: ({ key, failures }) => {
      metrics.authFailures += 1;
      log.warn({ key, failures }, 'Failed authentication attempt');
    },
    onLockout: ({ key, failures, lockoutMs, lockoutCount }) => {
      metrics.authLockouts += 1;
      log.warn(
        { key, failures, lockoutMs, lockoutCount },
        'Authentication lockout triggered (possible brute-force)',
      );
    },
  });

  // Auth middlewares are exposed as [authGuard, requireX] arrays; Express
  // flattens nested handler arrays, so existing route registrations pick up the
  // guard with no change. Only auth-bearing routes are guarded, which keeps a
  // 200 on a public route from ever resetting an attacker's failure counter.
  const requireApiKey = [
    authGuard,
    createApiKeyAuth({
      apiKeys:
        /** @type {string} */ (options.apiKeys) ??
        /** @type {string} */ (options.apiKey) ??
        process.env.TRIVELA_API_KEYS ??
        process.env.TRIVELA_API_KEY ??
        '',
      apiKeyRepository: options.apiKeyRepository ?? apiKeyRepository,
    }),
  ];
  const requireMasterKey = [
    authGuard,
    createMasterKeyAuth({
      masterKey: /** @type {string} */ (options.masterKey) ?? process.env.TRIVELA_MASTER_KEY ?? '',
    }),
  ];
  const requireAdminMasterKey = requireMasterKey;

  let rateLimitStore = null;
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
  if (redisUrl && !options.disableRedis) {
    try {
      const redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      redisClient.on('error', (err) => {
        log.error({ err }, 'Redis connection error');
      });
      rateLimitStore = createRedisStore(redisClient);
      log.info(
        { redisUrl: redisUrl.replace(/:[^:@]+@/, ':***@') },
        'Rate limiter using Redis store',
      );
    } catch (error) {
      log.warn(
        { err: error },
        'Failed to connect to Redis, falling back to in-memory rate limiter',
      );
    }
  }

  const rateLimiter = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: rateLimitMaxRequests,
    timeProvider: /** @type {any} */ (options.rateLimit)?.timeProvider,
    store: rateLimitStore,
  });

  app.use(requestId);
  app.use(compression({ threshold: 1024 }));
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(securityHeaders);
  app.use(traceparentMiddleware());
  app.use(requestLogger);
  app.use(express.json({ limit: jsonBodyLimit }));

  const uploadDir = process.env.UPLOAD_DIR ?? './uploads';
  if ((process.env.STORAGE_BACKEND ?? 'local') === 'local') {
    app.use('/uploads', express.static(uploadDir));
  }
  app.use(
    (
      /** @type {any} */ err,
      /** @type {import('express').Request} */ _req,
      /** @type {import('express').Response} */ res,
      /** @type {import('express').NextFunction} */ next,
    ) => {
      if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
      }
      return next(err);
    },
  );
  app.use(
    (
      /** @type {import('express').Request} */ req,
      /** @type {import('express').Response} */ res,
      /** @type {import('express').NextFunction} */ next,
    ) => {
      metrics.requestTotal += 1;
      const _reqStart = Date.now();
      res.on('finish', () => {
        const routeKey = `${req.method} ${req.path}`;
        metrics.routeHits.set(routeKey, (metrics.routeHits.get(routeKey) ?? 0) + 1);
        if (res.statusCode >= 400) {
          metrics.requestErrors += 1;
        }
        // Record request duration into the latency histogram.
        const durationMs = Date.now() - _reqStart;
        metrics.latencySum += durationMs;
        metrics.latencyTotal += 1;
        for (let _bi = 0; _bi < metrics.latencyBuckets.length; _bi++) {
          if (durationMs <= metrics.latencyBuckets[_bi]) {
            metrics.latencyCounts[_bi] += 1;
            break;
          }
        }
      });
      next();
    },
  );

  const SCHEMA_VERSION_HEADER = 'X-Trivela-Schema-Version';
  const SCHEMA_VERSION = '1';

  app.use(
    (
      /** @type {import('express').Request} */ req,
      /** @type {import('express').Response} */ res,
      /** @type {import('express').NextFunction} */ next,
    ) => {
      res.setHeader(SCHEMA_VERSION_HEADER, SCHEMA_VERSION);

      const requestedVersion = req.get(SCHEMA_VERSION_HEADER);
      if (requestedVersion && requestedVersion !== SCHEMA_VERSION) {
        return res.status(400).json({
          error: 'Unsupported API schema version',
          code: 'UNSUPPORTED_SCHEMA_VERSION',
          supported: SCHEMA_VERSION,
          requested: requestedVersion,
        });
      }

      return next();
    },
  );

  const jobMaxAttempts = normalizePositiveInteger(
    /** @type {any} */ (options.jobMaxAttempts) ?? process.env.JOB_MAX_RETRIES,
    5,
  );
  const jobBaseDelayMs = normalizePositiveInteger(
    /** @type {any} */ (options.jobBaseDelayMs) ?? process.env.JOB_BASE_DELAY_MS,
    1_000,
  );
  const jobMaxDelayMs = normalizePositiveInteger(
    /** @type {any} */ (options.jobMaxDelayMs) ?? process.env.JOB_MAX_DELAY_MS,
    30_000,
  );

  const jobRunner = createJobRunner({
    handlers: {
      async rpc_health_poll() {
        for (const url of rpcPool.getUrls()) {
          const result = await checkSorobanRpcHealth({ rpcUrl: url, fetchImpl });
          if (/** @type {any} */ (result).status === 'ok') {
            rpcPool.markHealthy(url);
          } else {
            rpcPool.markUnhealthy(url);
          }
        }
        const rpcUrl = rpcPool.getHealthyRpcUrl();
        const rpc = await checkSorobanRpcHealth({ rpcUrl, fetchImpl });
        rpcHealthCache.payload = rpc;
        rpcHealthCache.updatedAt = new Date().toISOString();
      },
      async webhook_retry_failed_deliveries() {
        await webhookService.retryFailedDeliveries();
      },
    },
    logger: log,
    deadLetter: failedJobRepository,
    defaultMaxAttempts: jobMaxAttempts,
    defaultBaseDelayMs: jobBaseDelayMs,
    defaultMaxDelayMs: jobMaxDelayMs,
  });

  if (!options.disableJobs && rpcPollIntervalMs > 0) {
    jobRunner.enqueue('rpc_health_poll', null);
    setInterval(() => jobRunner.enqueue('rpc_health_poll', null), rpcPollIntervalMs).unref?.();
  }

  // Enqueue webhook retry job every 5 minutes (Issue #352)
  if (!options.disableJobs) {
    const webhookRetryIntervalMs = 5 * 60 * 1000; // 5 minutes
    jobRunner.enqueue('webhook_retry_failed_deliveries', null);
    setInterval(
      () => jobRunner.enqueue('webhook_retry_failed_deliveries', null),
      webhookRetryIntervalMs,
    ).unref?.();
  }

  async function buildHealthPayload() {
    const rpcUrl = rpcPool.getHealthyRpcUrl();
    const rpc = rpcHealthCache.payload ?? (await checkSorobanRpcHealth({ rpcUrl, fetchImpl }));

    return {
      status: /** @type {any} */ (rpc).status === 'ok' ? 'ok' : 'degraded',
      service: 'trivela-api',
      timestamp: new Date().toISOString(),
      rpc,
      rpcPool: rpcPool.getStatus(),
    };
  }

  /** @param {import('express').Request} req @returns {string} */
  function formatAuditActor(req) {
    const apiKey = req?.auth?.type === 'apiKey' ? req.auth.apiKey : '';
    if (!apiKey) return 'anonymous';
    const key = String(apiKey);
    if (key.length <= 8) return 'apiKey:***';
    return `apiKey:${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  /**
   * @param {import('express').Request} req
   * @param {{ action: string, entity: string, entityId: string, diff: unknown }} entry
   */
  function recordAuditEntry(req, { action, entity, entityId, diff }) {
    try {
      auditLogRepository.create({
        actor: formatAuditActor(req),
        action,
        entity,
        entityId,
        diff,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.warn({ err: error }, 'Failed to record audit entry');
    }
  }

  app.get('/health', async (_req, res) => {
    const payload = await buildHealthPayload();
    res.json(payload);
  });

  const siteOrigin =
    process.env.SITE_ORIGIN ?? allowedOrigins.find((origin) => origin !== '*') ?? '';
  app.get('/embed/campaign/:id', createEmbedRoute(campaignRepository, siteOrigin));

  app.get('/health/rpc', async (_req, res) => {
    const rpcUrl = rpcPool.getHealthyRpcUrl();
    const rpc = await checkSorobanRpcHealth({ rpcUrl, fetchImpl });
    if (/** @type {any} */ (rpc).status !== 'ok') {
      rpcPool.markUnhealthy(rpcUrl);
    }
    res.status(/** @type {any} */ (rpc).status === 'ok' ? 200 : 503).json({
      ...rpc,
      rpcPool: rpcPool.getStatus(),
    });
  });

  app.get('/metrics', (_req, res) => {
    const uptimeSeconds = process.uptime();
    const routeLines = [...metrics.routeHits.entries()]
      .map(([route, count]) => {
        const escapedRoute = route.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `trivela_route_hits_total{route="${escapedRoute}"} ${count}`;
      })
      .join('\n');

    // Latency histogram — cumulative buckets (le = upper bound in ms).
    const latencyBucketLines = metrics.latencyBuckets
      .map((le, i) => {
        const cumulative = metrics.latencyCounts.slice(0, i + 1).reduce((a, b) => a + b, 0);
        const leLabel = le === Infinity ? '+Inf' : String(le);
        return `trivela_http_request_duration_ms_bucket{le="${leLabel}"} ${cumulative}`;
      })
      .join('\n');

    // RPC pool saturation metrics.
    const poolStatus = rpcPool.getStatus();

    const payload = [
      '# HELP trivela_requests_total Total HTTP requests handled.',
      '# TYPE trivela_requests_total counter',
      `trivela_requests_total ${metrics.requestTotal}`,
      '# HELP trivela_request_errors_total Total HTTP requests with status >= 400.',
      '# TYPE trivela_request_errors_total counter',
      `trivela_request_errors_total ${metrics.requestErrors}`,
      '# HELP trivela_auth_failures_total Total failed authentication attempts on guarded routes.',
      '# TYPE trivela_auth_failures_total counter',
      `trivela_auth_failures_total ${metrics.authFailures}`,
      '# HELP trivela_auth_lockouts_total Total brute-force lockouts triggered on guarded routes.',
      '# TYPE trivela_auth_lockouts_total counter',
      `trivela_auth_lockouts_total ${metrics.authLockouts}`,
      '# HELP trivela_process_uptime_seconds Node.js process uptime.',
      '# TYPE trivela_process_uptime_seconds gauge',
      `trivela_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
      '# HELP trivela_route_hits_total Route-level request counts.',
      '# TYPE trivela_route_hits_total counter',
      routeLines,
      // Request latency histogram (issue #650 — p95 latency SLO).
      '# HELP trivela_http_request_duration_ms HTTP request duration in milliseconds.',
      '# TYPE trivela_http_request_duration_ms histogram',
      latencyBucketLines,
      `trivela_http_request_duration_ms_count ${metrics.latencyTotal}`,
      `trivela_http_request_duration_ms_sum ${metrics.latencySum}`,
      // RPC pool saturation (issue #650 — pool saturation safety).
      '# HELP trivela_rpc_pool_in_use RPC pool slots currently in use.',
      '# TYPE trivela_rpc_pool_in_use gauge',
      `trivela_rpc_pool_in_use ${poolStatus.in_use}`,
      '# HELP trivela_rpc_pool_idle RPC pool slots immediately available.',
      '# TYPE trivela_rpc_pool_idle gauge',
      `trivela_rpc_pool_idle ${poolStatus.idle}`,
      '# HELP trivela_rpc_pool_waiting Callers queued waiting for a pool slot.',
      '# TYPE trivela_rpc_pool_waiting gauge',
      `trivela_rpc_pool_waiting ${poolStatus.waiting}`,
      '# HELP trivela_rpc_pool_healthy Healthy RPC endpoints in the pool.',
      '# TYPE trivela_rpc_pool_healthy gauge',
      `trivela_rpc_pool_healthy ${poolStatus.healthy}`,
      '# HELP trivela_rpc_pool_unhealthy Unhealthy RPC endpoints in the pool.',
      '# TYPE trivela_rpc_pool_unhealthy gauge',
      `trivela_rpc_pool_unhealthy ${poolStatus.unhealthy}`,
    ]
      .filter(Boolean)
      .join('\n');

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(`${payload}\n`);
  });

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function apiInfo(req, res) {
    const usingLegacyPrefix =
      req.path.startsWith(LEGACY_API_PREFIX) && !req.path.startsWith(API_V1_PREFIX);

    res.json({
      name: 'Trivela API',
      version: '0.1.0',
      prefix: API_V1_PREFIX,
      endpoints: {
        health: 'GET /health',
        healthRpc: 'GET /health/rpc',
        metrics: 'GET /metrics',
        info: `GET ${API_V1_PREFIX}`,
        campaigns: `GET ${API_V1_PREFIX}/campaigns`,
        campaignById: `GET ${API_V1_PREFIX}/campaigns/:id`,
        campaignBySlug: `GET ${API_V1_PREFIX}/campaigns/by-slug/:slug`,
        createCampaign: `POST ${API_V1_PREFIX}/campaigns`,
        cloneCampaign: `POST ${API_V1_PREFIX}/campaigns/:id/clone`,
        updateCampaign: `PUT ${API_V1_PREFIX}/campaigns/:id`,
        deleteCampaign: `DELETE ${API_V1_PREFIX}/campaigns/:id`,
        auditLogs: `GET ${API_V1_PREFIX}/audit-logs`,
        config: `GET ${API_V1_PREFIX}/config`,
        explorer: `GET ${API_V1_PREFIX}/explorer`,
      },
      compatibility: {
        legacyPrefix: LEGACY_API_PREFIX,
        legacyRoutesSupported: true,
        migrationNote:
          'Prefer /api/v1/* routes. Legacy /api/* routes remain available for compatibility.',
        usingLegacyPrefix,
      },
      stellar: {
        ...stellarConfig,
      },
      config: {
        rewardsContractId: rewardsContractId || null,
        campaignContractId: campaignContractId || null,
      },
      cors: {
        allowedOrigins,
      },
      rateLimit: {
        keying: 'per API key when present, otherwise per IP address',
        windowMs: rateLimitWindowMs,
        maxRequests: rateLimitMaxRequests,
      },
      authLockout: {
        keying: 'per client IP address',
        softThreshold: authLockoutSoftThreshold,
        hardThreshold: authLockoutHardThreshold,
        baseLockoutMs: authLockoutBaseMs,
      },
      body: {
        jsonLimit: jsonBodyLimit,
      },
    });
  }

  /** @param {import('express').Request} _req @param {import('express').Response} res */
  function getPublicConfig(_req, res) {
    res.json({
      stellar: {
        ...stellarConfig,
      },
      contracts: {
        rewards: rewardsContractId || null,
        campaign: campaignContractId || null,
      },
    });
  }

  /** @param {import('express').Request} _req @param {import('express').Response} res */
  function getExplorerLinks(_req, res) {
    res.json({
      network: stellarConfig.network,
      explorerUrl: stellarConfig.explorerUrl,
    });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function listCampaigns(req, res) {
    const cacheKey = `campaigns:${req.originalUrl}`;
    const cached = shortCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.set('x-cache', 'HIT').json(cached.payload);
    }

    const activeRaw =
      typeof req.query.active === 'string' ? req.query.active.toLowerCase() : undefined;
    const activeFilter = activeRaw === 'true' ? true : activeRaw === 'false' ? false : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const order =
      req.query.order === 'asc' ? 'asc' : req.query.order === 'desc' ? 'desc' : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
    const tagsRaw = typeof req.query.tags === 'string' ? req.query.tags.trim() : '';
    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const items = campaignRepository.list({ active: activeFilter, q, sort, order, category, tags });
    const payload = paginateItems(items, req.query);
    shortCache.set(cacheKey, {
      expiresAt: Date.now() + shortCacheTtlMs,
      payload,
    });
    return res.set('x-cache', 'MISS').json(payload);
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function getCampaignById(req, res) {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    return res.json(campaign);
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function getCampaignStats(req, res) {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }

    const stats = buildCampaignStats({
      db: dal.db,
      campaign,
      referralRepository,
      indexerCursor: indexerCursorState,
      query: req.query,
    });

    return res.json(stats);
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function getCampaignBySlug(req, res) {
    const campaign = campaignRepository.getBySlug(req.params.slug);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    return res.json(campaign);
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function createCampaign(req, res) {
    const result = campaignCreateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid campaign payload',
        code: 'VALIDATION_ERROR',
        details: formatZodErrors(result.error),
      });
    }

    const {
      name,
      slug,
      description,
      rewardPerAction,
      referralBonusPoints,
      startDate,
      endDate,
      featured,
      hidden,
      hiddenReason,
      active,
      contractId,
      imageUrl,
      tags,
      category,
    } = result.data;
    try {
      const campaign = campaignRepository.create({
        name,
        slug: slug || undefined,
        description: description || '',
        active: active ?? true,
        featured: featured ?? false,
        hidden: hidden ?? false,
        hiddenReason: hiddenReason ?? null,
        rewardPerAction: rewardPerAction ?? 0,
        referralBonusPoints: referralBonusPoints ?? 0,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        contractId: contractId ?? null,
        imageUrl: imageUrl ?? null,
        tags: tags ?? [],
        category: category ?? null,
      });
      recordAuditEntry(req, {
        action: 'create',
        entity: 'campaign',
        entityId: campaign.id,
        diff: { after: campaign },
      });

      // Dispatch webhook event (Issue #287)
      webhookService
        .dispatchEvent({
          type: WEBHOOK_EVENTS.CAMPAIGN_CREATED,
          campaignId: campaign.id,
          data: campaign,
          timestamp: new Date().toISOString(),
        })
        .catch((err) => {
          log.warn({ err, campaignId: campaign.id }, 'Failed to dispatch campaign.created webhook');
        });

      shortCache.clear();
      return res.status(201).json(campaign);
    } catch (error) {
      if (
        /** @type {any} */ (error).message?.includes('Tag') ||
        /** @type {any} */ (error).message?.includes('Category')
      ) {
        return res.status(400).json({
          error: /** @type {Error} */ (error).message,
          code: 'VALIDATION_ERROR',
        });
      }
      if (/** @type {any} */ (error).message?.includes('UNIQUE constraint failed')) {
        return res.status(409).json({
          error: 'Slug already exists',
          code: 'SLUG_CONFLICT',
          details: ['A campaign with this slug already exists'],
        });
      }
      throw error;
    }
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function updateCampaign(req, res) {
    const result = campaignUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid campaign payload',
        code: 'VALIDATION_ERROR',
        details: formatZodErrors(result.error),
      });
    }

    const {
      name,
      description,
      active,
      rewardPerAction,
      referralBonusPoints,
      startDate,
      endDate,
      featured,
      hidden,
      hiddenReason,
      contractId,
      imageUrl,
      tags,
      category,
    } = result.data;
    /** @type {Record<string, unknown>} */
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (active !== undefined) updateFields.active = active;
    if (featured !== undefined) updateFields.featured = featured;
    if (rewardPerAction !== undefined) updateFields.rewardPerAction = rewardPerAction;
    if (referralBonusPoints !== undefined) updateFields.referralBonusPoints = referralBonusPoints;
    if (startDate !== undefined) updateFields.startDate = startDate;
    if (endDate !== undefined) updateFields.endDate = endDate;
    if (hidden !== undefined) updateFields.hidden = hidden;
    if (hiddenReason !== undefined) updateFields.hiddenReason = hiddenReason;
    if (contractId !== undefined) updateFields.contractId = contractId;
    if (imageUrl !== undefined) updateFields.imageUrl = imageUrl;
    if (tags !== undefined) updateFields.tags = tags;
    if (category !== undefined) updateFields.category = category;

    const before = campaignRepository.getById(req.params.id);
    if (!before) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }

    let campaign;
    try {
      campaign = campaignRepository.update(req.params.id, updateFields);
    } catch (error) {
      if (
        /** @type {any} */ (error).message?.includes('Tag') ||
        /** @type {any} */ (error).message?.includes('Category')
      ) {
        return res.status(400).json({
          error: /** @type {Error} */ (error).message,
          code: 'VALIDATION_ERROR',
        });
      }
      throw error;
    }

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    const changes = Object.keys(updateFields);
    recordAuditEntry(req, {
      action: 'update',
      entity: 'campaign',
      entityId: campaign.id,
      diff: { before, after: campaign, changes },
    });

    // Dispatch webhook events (Issue #290, #352)
    const wasActive = before.active;
    const isNowActive = campaign.active;

    if (active !== undefined && wasActive !== isNowActive) {
      // Dispatch activation/deactivation event
      const eventType = isNowActive
        ? WEBHOOK_EVENTS.CAMPAIGN_ACTIVATED
        : WEBHOOK_EVENTS.CAMPAIGN_DEACTIVATED;
      webhookService
        .dispatchEvent({
          type: eventType,
          campaignId: campaign.id,
          data: campaign,
          timestamp: new Date().toISOString(),
        })
        .catch((err) => {
          log.warn(
            { err, campaignId: campaign.id, eventType },
            'Failed to dispatch campaign activation/deactivation webhook',
          );
        });
    } else {
      // Dispatch generic update event
      webhookService
        .dispatchEvent({
          type: WEBHOOK_EVENTS.CAMPAIGN_UPDATED,
          campaignId: campaign.id,
          data: campaign,
          timestamp: new Date().toISOString(),
        })
        .catch((err) => {
          log.warn({ err, campaignId: campaign.id }, 'Failed to dispatch campaign.updated webhook');
        });
    }

    shortCache.clear();
    return res.json(campaign);
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function deleteCampaign(req, res) {
    const before = campaignRepository.getById(req.params.id);
    const deleted = campaignRepository.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    recordAuditEntry(req, {
      action: 'delete',
      entity: 'campaign',
      entityId: req.params.id,
      diff: before ? { before } : null,
    });

    // Dispatch webhook event (Issue #285)
    if (before) {
      webhookService
        .dispatchEvent({
          type: WEBHOOK_EVENTS.CAMPAIGN_DELETED,
          campaignId: req.params.id,
          data: before,
          timestamp: new Date().toISOString(),
        })
        .catch((err) => {
          log.warn(
            { err, campaignId: req.params.id },
            'Failed to dispatch campaign.deleted webhook',
          );
        });
    }

    shortCache.clear();
    return res.status(204).end();
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function cloneCampaign(req, res) {
    const sourceId = req.params.id;
    const source = campaignRepository.getById(sourceId);

    if (!source) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }

    const overrides = req.body?.overrides || {};

    try {
      const clonedCampaign = campaignRepository.clone(sourceId, overrides);

      if (!clonedCampaign) {
        return res.status(500).json({ error: 'Failed to clone campaign', code: 'CLONE_FAILED' });
      }

      recordAuditEntry(req, {
        action: 'clone',
        entity: 'campaign',
        entityId: clonedCampaign.id,
        diff: { cloned_from: sourceId, overrides },
      });

      shortCache.clear();
      return res.status(201).json(clonedCampaign);
    } catch (error) {
      if (/** @type {any} */ (error).message?.includes('UNIQUE constraint failed')) {
        return res.status(409).json({
          error: 'Slug already exists',
          code: 'SLUG_CONFLICT',
          details: ['A campaign with this slug already exists'],
        });
      }
      throw error;
    }
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function listAuditLogs(req, res) {
    const entity = typeof req.query.entity === 'string' ? req.query.entity.trim() : '';
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '';
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const items = auditLogRepository.list({
      entity: entity || undefined,
      entityId: entityId || undefined,
      action: action || undefined,
    });
    return res.json(paginateItems(items, req.query));
  }

  /** @param {import('express').Request} _req @param {import('express').Response} res */
  function getIndexerCursorState(_req, res) {
    return res.json({
      cursor: indexerCursorState.cursor,
      updatedAt: indexerCursorState.updatedAt,
      source: indexerCursorState.source,
    });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function setIndexerCursorState(req, res) {
    const result = cursorBodySchema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: formatZodErrors(result.error)[0] ?? 'Invalid request body',
        code: 'VALIDATION_ERROR',
      });
    }
    const { cursor } = result.data;
    indexerCursorState.cursor = cursor;
    indexerCursorState.updatedAt = new Date().toISOString();
    indexerCursorState.source = 'api';
    return res.status(200).json({
      ok: true,
      cursor: indexerCursorState.cursor,
      updatedAt: indexerCursorState.updatedAt,
    });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function listCategories(_req, res) {
    const categories = campaignRepository.listCategories?.() ?? [];
    return res.json({ data: categories });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function listTags(_req, res) {
    const tags = campaignRepository.listTags?.() ?? [];
    return res.json({ data: tags });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  async function getAdminDashboard(req, res) {
    const cacheKey = 'admin:dashboard';
    const cached = shortCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.set('x-cache', 'HIT').json(cached.payload);
    }

    // Campaign stats
    const allCampaigns = campaignRepository.list({ includeHidden: true });
    const totalCampaigns = allCampaigns.length;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const campaignsByStatus = {
      draft: allCampaigns.filter((c) => !c.active && c.hidden).length,
      published: allCampaigns.filter((c) => c.active && !c.hidden).length,
      archived: allCampaigns.filter((c) => !c.active && !c.hidden).length,
    };

    const campaignsCreatedLast7Days = allCampaigns.filter(
      (c) => new Date(c.createdAt) >= sevenDaysAgo,
    ).length;
    const campaignsCreatedLast30Days = allCampaigns.filter(
      (c) => new Date(c.createdAt) >= thirtyDaysAgo,
    ).length;

    // Participants (unique wallets from referrals)
    const allReferrals = referralRepository.listAll?.() ?? [];
    const uniqueParticipants = new Set();
    for (const referral of allReferrals) {
      uniqueParticipants.add(referral.refereeAddress);
      uniqueParticipants.add(referral.referrerAddress);
    }
    const totalParticipants = uniqueParticipants.size;

    // Rewards stats (placeholder - would need indexer event DB integration)
    const rewards = {
      totalPointsCredited: 0,
      totalClaimed: 0,
      redemptionRate: 0,
    };

    // Activity: registrations per day (last 30 days)
    const activity = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayReferrals = allReferrals.filter((r) => r.createdAt.startsWith(dateStr)).length;
      activity.push({ date: dateStr, registrations: dayReferrals });
    }

    // Errors from metrics (last 24h would need time-series tracking, using current total)
    const errors = {
      last24h: metrics.requestErrors,
    };

    // RPC pool status
    const rpc = rpcPool.getStatus();

    const payload = {
      campaigns: {
        total: totalCampaigns,
        byStatus: campaignsByStatus,
        createdLast7Days: campaignsCreatedLast7Days,
        createdLast30Days: campaignsCreatedLast30Days,
      },
      participants: {
        total: totalParticipants,
      },
      rewards,
      activity,
      errors,
      rpc,
      timestamp: now.toISOString(),
    };

    shortCache.set(cacheKey, {
      expiresAt: Date.now() + 60000, // 60 seconds
      payload,
    });

    return res.set('x-cache', 'MISS').json(payload);
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function listAdminCampaigns(req, res) {
    const allCampaigns = campaignRepository.list({ includeHidden: true });
    return res.json(paginateItems(allCampaigns, req.query));
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  async function uploadCampaignImageHandler(req, res) {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }

    const file = /** @type {Express.Multer.File | undefined} */ (req.file);
    const validation = validateImageUpload({
      buffer: file?.buffer,
      mimetype: file?.mimetype ?? '',
      size: file?.size ?? 0,
      originalname: file?.originalname,
    });

    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error,
        code: validation.code,
      });
    }

    try {
      const { imageUrl } = await uploadCampaignImage(storageAdapter, {
        buffer: validation.buffer,
        mimeType: validation.mimeType,
        campaignId: campaign.id,
      });

      const updated = campaignRepository.update(campaign.id, { imageUrl });
      recordAuditEntry(req, {
        action: 'update',
        entity: 'campaign',
        entityId: campaign.id,
        diff: { before: campaign, after: updated, changes: ['imageUrl'] },
      });

      shortCache.clear();
      return res.status(200).json({ imageUrl });
    } catch (error) {
      log.error({ err: error, campaignId: campaign.id }, 'Failed to upload campaign image');
      return res.status(500).json({
        error: 'Failed to upload image',
        code: 'UPLOAD_FAILED',
      });
    }
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function createApiKeyHandler(req, res) {
    const result = apiKeyCreateSchema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid API key payload',
        code: 'VALIDATION_ERROR',
        details: formatZodErrors(result.error),
      });
    }

    const created = apiKeyRepository.create({
      label: result.data.label ?? '',
      expiresAt: result.data.expiresAt ?? null,
    });

    recordAuditEntry(req, {
      action: 'create',
      entity: 'apiKey',
      entityId: created.key.id,
      diff: { after: created.key },
    });

    return res.status(201).json({
      key: created.rawKey,
      metadata: created.key,
    });
  }

  /** @param {import('express').Request} _req @param {import('express').Response} res */
  function listApiKeysHandler(_req, res) {
    const keys = apiKeyRepository.list();
    return res.json({ data: keys });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function revokeApiKeyHandler(req, res) {
    const before = apiKeyRepository.getById(req.params.id);
    if (!before) {
      return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
    }

    apiKeyRepository.revoke(req.params.id);
    recordAuditEntry(req, {
      action: 'revoke',
      entity: 'apiKey',
      entityId: req.params.id,
      diff: { before },
    });

    return res.status(204).end();
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function rotateApiKeyHandler(req, res) {
    const rotated = apiKeyRepository.rotate(req.params.id);
    if (!rotated) {
      return res
        .status(404)
        .json({ error: 'API key not found or already revoked', code: 'API_KEY_NOT_FOUND' });
    }

    recordAuditEntry(req, {
      action: 'rotate',
      entity: 'apiKey',
      entityId: req.params.id,
      diff: { newKeyId: rotated.key.id },
    });

    return res.status(200).json({
      key: rotated.rawKey,
      metadata: rotated.key,
    });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function listFailedJobsHandler(req, res) {
    const limitRaw = Number.parseInt(/** @type {string} */ (req.query.limit), 10);
    const offsetRaw = Number.parseInt(/** @type {string} */ (req.query.offset), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const items = failedJobRepository.list({ limit, offset });
    const total = failedJobRepository.count();

    return res.json({
      data: items,
      pagination: { total, count: items.length, limit, offset },
    });
  }

  /** @param {import('express').Request} req @param {import('express').Response} res */
  function retryFailedJobHandler(req, res) {
    const entry = failedJobRepository.getById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Failed job not found', code: 'FAILED_JOB_NOT_FOUND' });
    }

    jobRunner.enqueue(entry.type, entry.payload);
    failedJobRepository.remove(entry.id);

    recordAuditEntry(req, {
      action: 'retry',
      entity: 'failedJob',
      entityId: entry.id,
      diff: { type: entry.type, attempts: entry.attempts },
    });

    return res.status(202).json({
      requeued: true,
      job: { id: entry.id, type: entry.type },
    });
  }

  /** @param {string} prefix */
  function registerApiRoutes(prefix) {
    app.get(prefix, rateLimiter, apiInfo);
    app.get(`${prefix}/config`, rateLimiter, getPublicConfig);
    app.get(`${prefix}/explorer`, rateLimiter, getExplorerLinks);
    app.get(`${prefix}/campaigns`, rateLimiter, listCampaigns);
    app.get(`${prefix}/categories`, rateLimiter, listCategories);
    app.get(`${prefix}/tags`, rateLimiter, listTags);
    app.get(`${prefix}/campaigns/by-slug/:slug`, rateLimiter, getCampaignBySlug);
    app.get(`${prefix}/campaigns/:id`, rateLimiter, getCampaignById);
    app.get(`${prefix}/campaigns/:id/stats`, rateLimiter, getCampaignStats);
    app.get(`${prefix}/audit-logs`, rateLimiter, requireApiKey, listAuditLogs);
    app.get(`${prefix}/indexer/cursor`, rateLimiter, getIndexerCursorState);
    app.post(`${prefix}/indexer/cursor`, rateLimiter, requireApiKey, setIndexerCursorState);
    app.post(`${prefix}/campaigns`, rateLimiter, requireApiKey, createCampaign);
    app.post(`${prefix}/campaigns/:id/clone`, rateLimiter, requireApiKey, cloneCampaign);
    app.post(`${prefix}/campaigns/:id/image`, rateLimiter, requireApiKey, (req, res, next) => {
      imageUpload.single('image')(req, res, (err) => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'Image must be 5MB or smaller',
            code: 'FILE_TOO_LARGE',
          });
        }
        if (err) return next(err);
        return uploadCampaignImageHandler(req, res);
      });
    });
    app.put(`${prefix}/campaigns/:id`, rateLimiter, requireApiKey, updateCampaign);
    app.delete(`${prefix}/campaigns/:id`, rateLimiter, requireApiKey, deleteCampaign);

    app.post(`${prefix}/admin/api-keys`, rateLimiter, requireMasterKey, createApiKeyHandler);
    app.get(`${prefix}/admin/api-keys`, rateLimiter, requireMasterKey, listApiKeysHandler);
    app.delete(`${prefix}/admin/api-keys/:id`, rateLimiter, requireMasterKey, revokeApiKeyHandler);
    app.put(
      `${prefix}/admin/api-keys/:id/rotate`,
      rateLimiter,
      requireMasterKey,
      rotateApiKeyHandler,
    );

    // Admin dashboard and campaign management (Issue #467)
    app.get(`${prefix}/admin/dashboard`, rateLimiter, requireMasterKey, getAdminDashboard);
    app.get(`${prefix}/admin/campaigns`, rateLimiter, requireMasterKey, listAdminCampaigns);

    // Job dead-letter inspection / requeue (Issue #286)
    app.get(`${prefix}/jobs/failed`, rateLimiter, requireApiKey, listFailedJobsHandler);
    app.post(`${prefix}/jobs/retry/:id`, rateLimiter, requireApiKey, retryFailedJobHandler);

    // Webhook routes (Issue #287)
    app.post(`${prefix}/webhooks`, rateLimiter, requireApiKey, (req, res) => {
      const { url, events, secret } = req.body;
      if (!url || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          error: 'Invalid webhook payload',
          code: 'VALIDATION_ERROR',
          details: ['url and events array are required'],
        });
      }
      const webhook = webhookRepository.create({ url, events, secret });
      recordAuditEntry(req, {
        action: 'create',
        entity: 'webhook',
        entityId: webhook.id,
        diff: { after: webhook },
      });
      return res.status(201).json(webhook);
    });

    app.get(`${prefix}/webhooks`, rateLimiter, requireApiKey, (req, res) => {
      const webhooks = webhookRepository.list();
      return res.json(paginateItems(webhooks, req.query));
    });

    app.get(`${prefix}/webhooks/:id`, rateLimiter, requireApiKey, (req, res) => {
      const webhook = webhookRepository.getById(req.params.id);
      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found', code: 'WEBHOOK_NOT_FOUND' });
      }
      return res.json(webhook);
    });

    app.put(`${prefix}/webhooks/:id`, rateLimiter, requireApiKey, (req, res) => {
      const { url, events, active } = req.body;
      const before = webhookRepository.getById(req.params.id);
      if (!before) {
        return res.status(404).json({ error: 'Webhook not found', code: 'WEBHOOK_NOT_FOUND' });
      }
      const updates = {};
      if (url !== undefined) updates.url = url;
      if (events !== undefined) updates.events = events;
      if (active !== undefined) updates.active = active;
      const webhook = webhookRepository.update(req.params.id, updates);
      recordAuditEntry(req, {
        action: 'update',
        entity: 'webhook',
        entityId: webhook.id,
        diff: { before, after: webhook },
      });
      return res.json(webhook);
    });

    app.delete(`${prefix}/webhooks/:id`, rateLimiter, requireApiKey, (req, res) => {
      const before = webhookRepository.getById(req.params.id);
      const deleted = webhookRepository.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Webhook not found', code: 'WEBHOOK_NOT_FOUND' });
      }
      recordAuditEntry(req, {
        action: 'delete',
        entity: 'webhook',
        entityId: req.params.id,
        diff: before ? { before } : null,
      });
      return res.status(204).end();
    });

    app.get(`${prefix}/webhooks/:id/deliveries`, rateLimiter, requireApiKey, (req, res) => {
      const webhook = webhookRepository.getById(req.params.id);
      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found', code: 'WEBHOOK_NOT_FOUND' });
      }
      const deliveries = webhookRepository.listDeliveries(req.params.id, {
        limit: parseInt(req.query.limit) || 100,
      });
      return res.json(paginateItems(deliveries, req.query));
    });

    // Referral routes (Issue #350)
    app.post(`${prefix}/campaigns/:id/referrals`, rateLimiter, (req, res) => {
      const campaign = campaignRepository.getById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
      }

      const { referrerAddress, refereeAddress } = req.body ?? {};
      if (!referrerAddress || typeof referrerAddress !== 'string') {
        return res
          .status(400)
          .json({ error: 'referrerAddress is required', code: 'VALIDATION_ERROR' });
      }
      if (!refereeAddress || typeof refereeAddress !== 'string') {
        return res
          .status(400)
          .json({ error: 'refereeAddress is required', code: 'VALIDATION_ERROR' });
      }
      if (referrerAddress === refereeAddress) {
        return res.status(400).json({
          error: 'referrerAddress and refereeAddress must be different',
          code: 'VALIDATION_ERROR',
        });
      }

      const referral = referralRepository.create({
        campaignId: req.params.id,
        referrerAddress: referrerAddress.trim(),
        refereeAddress: refereeAddress.trim(),
      });

      if (!referral) {
        return res.status(409).json({
          error: 'Referee already attributed to a referrer for this campaign',
          code: 'REFERRAL_DUPLICATE',
        });
      }

      return res.status(201).json(referral);
    });

    app.get(`${prefix}/campaigns/:id/referrals/:walletAddress`, rateLimiter, (req, res) => {
      const campaign = campaignRepository.getById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
      }

      const walletAddress = req.params.walletAddress.trim();
      const referralCount = referralRepository.countByReferrer(req.params.id, walletAddress);
      const bonusEarned = referralCount * (campaign.referralBonusPoints ?? 0);

      return res.json({
        walletAddress,
        campaignId: String(campaign.id),
        referralCount,
        referralBonusPoints: campaign.referralBonusPoints ?? 0,
        bonusEarned,
      });
    });

    // Variant routes for A/B testing (Issue #624)
    const variantRouter = createVariantRoutes({
      variantRepo: variantRepository,
      variantService,
      campaignRepo: campaignRepository,
    });
    app.use(prefix, rateLimiter, requireApiKey, variantRouter);

    // Cohort and retention analysis routes (Issue #623)
    const cohortRouter = createCohortRoutes({
      cohortService,
      campaignRepo: campaignRepository,
    });
    app.use(prefix, rateLimiter, requireApiKey, cohortRouter);

    // Web Push subscription routes (Issue #619)
    const pushRouter = createPushRoutes({
      repository: pushSubscriptionRepository,
      service: webPushService,
    });
    app.use(prefix, rateLimiter, requireApiKey, pushRouter);
  }

  registerApiRoutes(API_V1_PREFIX);
  registerApiRoutes(LEGACY_API_PREFIX);

  // Central error handler — must be registered after all routes
  app.use(errorHandler);

  return app;
}

/** @param {Record<string, unknown>} options @returns {Promise<import('http').Server>} */
export async function startServer(options = {}) {
  if (!options.skipEnvValidation) {
    validateBackendEnv(process.env);
  }

  const app = await createApp(options);
  const port = options.port ?? process.env.PORT ?? DEFAULT_PORT;

  const server = app.listen(port, () => {
    log.info({ port }, 'Trivela API running');
  });

  // ── Graceful shutdown (issue #650) ─────────────────────────────────────────
  // On SIGTERM / SIGINT:
  //   1. Stop accepting new connections (server.close).
  //   2. Allow in-flight HTTP requests to finish for up to SHUTDOWN_GRACE_MS.
  //   3. Send "Connection: close / will-reconnect" hint to open SSE/WS streams.
  //   4. Flush OTel spans.
  //   5. Exit 0 once everything is drained (or force-exit after the grace window).
  const SHUTDOWN_GRACE_MS = normalizePositiveInteger(process.env.SHUTDOWN_GRACE_MS, 15_000);

  let shuttingDown = false;

  async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal, graceMs: SHUTDOWN_GRACE_MS }, 'graceful shutdown started');

    // Force exit after the grace window so a stuck handler never blocks a deploy.
    const forceTimer = setTimeout(() => {
      log.error('graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    // Stop accepting new connections; drain in-flight HTTP requests.
    await new Promise((resolve) => server.close(resolve));

    // Flush OTel exporter.
    await shutdownTracing().catch((err) => log.warn({ err }, 'OTel shutdown warning'));

    log.info('graceful shutdown complete');
    clearTimeout(forceTimer);
    process.exit(0);
  }

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

const isExecutedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  startServer();
}
