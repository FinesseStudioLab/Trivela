/**
 * Trivela Backend API
 * Serves campaign data, health, and Stellar/Soroban RPC proxy for the frontend.
 */

import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';
import Redis from 'ioredis';
import createApiKeyAuth from './middleware/apiKeyAuth.js';
import { createRateLimiter, createRedisStore } from './middleware/rateLimit.js';
import requestLogger, { log } from './middleware/logger.js';
import requestId from './middleware/requestId.js';
import securityHeaders from './middleware/securityHeaders.js';
import errorHandler from './middleware/errorHandler.js';
import { paginateItems } from './pagination.js';
import { checkSorobanRpcHealth } from './sorobanRpc.js';
import { resolveStellarNetworkConfig } from './config/stellarNetwork.js';
import { validateBackendEnv } from './config/envValidation.js';
import { createDal } from './dal/index.js';
import { createJobRunner } from './jobs/jobRunner.js';
import { WebhookService, WEBHOOK_EVENTS } from './services/webhookService.js';
import {
  campaignCreateSchema,
  campaignUpdateSchema,
  cursorBodySchema,
  formatZodErrors,
} from './schemas.js';

const DEFAULT_PORT = 3001;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;
const DEFAULT_SHORT_CACHE_TTL_MS = 5_000;
const DEFAULT_JSON_BODY_LIMIT = '100kb';
const DEFAULT_RPC_POLL_INTERVAL_MS = 60_000;
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
    allowedHeaders: ['Content-Type', 'X-API-Key'],
  };

  if (allowedOrigins.includes('*')) {
    return { origin: true, ...corsOptions };
  }

  return {
    origin(/** @type {string | undefined} */ origin, /** @type {(err: Error | null, allow?: boolean) => void} */ callback) {
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
    /** @type {string} */ (options.jsonBodyLimit) ?? process.env.JSON_BODY_LIMIT ?? DEFAULT_JSON_BODY_LIMIT;
  const corsAllowedOriginsRaw =
    /** @type {string | undefined} */ (options.corsAllowedOrigins) ??
    process.env.CORS_ALLOWED_ORIGINS ??
    process.env.CORS_ORIGIN ??
    (isProduction ? '' : 'http://localhost:5173');
  const stellarConfig = resolveStellarNetworkConfig({
    network: /** @type {string} */ (options.stellarNetwork) ?? process.env.STELLAR_NETWORK,
    sorobanRpcUrl: /** @type {string} */ (options.sorobanRpcUrl) ?? process.env.SOROBAN_RPC_URL,
    horizonUrl: /** @type {string} */ (options.horizonUrl) ?? process.env.HORIZON_URL,
    networkPassphrase: /** @type {string} */ (options.networkPassphrase) ?? process.env.STELLAR_NETWORK_PASSPHRASE,
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
  const allowedOrigins = parseAllowedOrigins(corsAllowedOriginsRaw);

  if (isProduction && allowedOrigins.includes('*')) {
    throw new Error(
      'Wildcard origins are not permitted in production.',
    );
  }

  const rateLimitWindowMs = normalizePositiveInteger(
    /** @type {any} */ (options.rateLimit)?.windowMs ?? process.env.RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
  );
  const rateLimitMaxRequests = normalizePositiveInteger(
    /** @type {any} */ (options.rateLimit)?.maxRequests ?? process.env.RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
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
  const webhookService = new WebhookService(webhookRepository, {
    fetchImpl,
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
    cursor: /** @type {string | null} */ (options.initialIndexerCursor) ?? process.env.INDEXER_EVENT_CURSOR ?? null,
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
  };

  const requireApiKey = createApiKeyAuth({
    apiKeys: /** @type {string} */ (options.apiKeys) ?? /** @type {string} */ (options.apiKey) ?? process.env.TRIVELA_API_KEYS ?? process.env.TRIVELA_API_KEY ?? '',
  });

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
      log.info({ redisUrl: redisUrl.replace(/:[^:@]+@/, ':***@') }, 'Rate limiter using Redis store');
    } catch (error) {
      log.warn({ err: error }, 'Failed to connect to Redis, falling back to in-memory rate limiter');
    }
  }

  const rateLimiter = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: rateLimitMaxRequests,
    timeProvider: /** @type {any} */ (options.rateLimit)?.timeProvider,
    store: rateLimitStore,
  });

  app.use(requestId);
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(securityHeaders);
  app.use(requestLogger);
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use((/** @type {any} */ err, /** @type {import('express').Request} */ _req, /** @type {import('express').Response} */ res, /** @type {import('express').NextFunction} */ next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
    }
    return next(err);
  });
  app.use((/** @type {import('express').Request} */ req, /** @type {import('express').Response} */ res, /** @type {import('express').NextFunction} */ next) => {
    metrics.requestTotal += 1;
    res.on('finish', () => {
      const routeKey = `${req.method} ${req.path}`;
      metrics.routeHits.set(routeKey, (metrics.routeHits.get(routeKey) ?? 0) + 1);
      if (res.statusCode >= 400) {
        metrics.requestErrors += 1;
      }
    });
    next();
  });

  const SCHEMA_VERSION_HEADER = 'X-Trivela-Schema-Version';
  const SCHEMA_VERSION = '1';

  app.use((/** @type {import('express').Request} */ req, /** @type {import('express').Response} */ res, /** @type {import('express').NextFunction} */ next) => {
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
  });

  const jobRunner = createJobRunner({
    handlers: {
      async rpc_health_poll() {
        const rpc = await checkSorobanRpcHealth({
          rpcUrl: stellarConfig.sorobanRpcUrl,
          fetchImpl,
        });
        rpcHealthCache.payload = rpc;
        rpcHealthCache.updatedAt = new Date().toISOString();
      },
      async webhook_retry_failed_deliveries() {
        await webhookService.retryFailedDeliveries();
      },
    },
    logger: log,
  });

  if (!options.disableJobs && rpcPollIntervalMs > 0) {
    jobRunner.enqueue('rpc_health_poll', null);
    setInterval(() => jobRunner.enqueue('rpc_health_poll', null), rpcPollIntervalMs).unref?.();
  }

  // Enqueue webhook retry job every 5 minutes (Issue #352)
  if (!options.disableJobs) {
    const webhookRetryIntervalMs = 5 * 60 * 1000; // 5 minutes
    jobRunner.enqueue('webhook_retry_failed_deliveries', null);
    setInterval(() => jobRunner.enqueue('webhook_retry_failed_deliveries', null), webhookRetryIntervalMs).unref?.();
  }

  async function buildHealthPayload() {
    const rpc =
      rpcHealthCache.payload ??
      (await checkSorobanRpcHealth({
        rpcUrl: stellarConfig.sorobanRpcUrl,
        fetchImpl,
      }));

    return {
      status: /** @type {any} */ (rpc).status === 'ok' ? 'ok' : 'degraded',
      service: 'trivela-api',
      timestamp: new Date().toISOString(),
      rpc,
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

  app.get('/health/rpc', async (_req, res) => {
    const rpc = await checkSorobanRpcHealth({
      rpcUrl: stellarConfig.sorobanRpcUrl,
      fetchImpl,
    });
    res.status(/** @type {any} */ (rpc).status === 'ok' ? 200 : 503).json(rpc);
  });

  app.get('/metrics', (_req, res) => {
    const uptimeSeconds = process.uptime();
    const routeLines = [...metrics.routeHits.entries()]
      .map(([route, count]) => {
        const escapedRoute = route.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `trivela_route_hits_total{route="${escapedRoute}"} ${count}`;
      })
      .join('\n');

    const payload = [
      '# HELP trivela_requests_total Total HTTP requests handled.',
      '# TYPE trivela_requests_total counter',
      `trivela_requests_total ${metrics.requestTotal}`,
      '# HELP trivela_request_errors_total Total HTTP requests with status >= 400.',
      '# TYPE trivela_request_errors_total counter',
      `trivela_request_errors_total ${metrics.requestErrors}`,
      '# HELP trivela_process_uptime_seconds Node.js process uptime.',
      '# TYPE trivela_process_uptime_seconds gauge',
      `trivela_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
      '# HELP trivela_route_hits_total Route-level request counts.',
      '# TYPE trivela_route_hits_total counter',
      routeLines,
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
        updateCampaign: `PUT ${API_V1_PREFIX}/campaigns/:id`,
        deleteCampaign: `DELETE ${API_V1_PREFIX}/campaigns/:id`,
        auditLogs: `GET ${API_V1_PREFIX}/audit-logs`,
        config: `GET ${API_V1_PREFIX}/config`,
        explorer: `GET ${API_V1_PREFIX}/explorer`,
      },
      compatibility: {
        legacyPrefix: LEGACY_API_PREFIX,
        legacyRoutesSupported: true,
        migrationNote: 'Prefer /api/v1/* routes. Legacy /api/* routes remain available for compatibility.',
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
    const activeFilter =
      activeRaw === 'true' ? true : activeRaw === 'false' ? false : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const order = req.query.order === 'asc' ? 'asc' : req.query.order === 'desc' ? 'desc' : undefined;
    const items = campaignRepository.list({ active: activeFilter, q, sort, order });
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

    const { name, slug, description, rewardPerAction, startDate, endDate, featured, hidden, hiddenReason, active } = result.data;
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
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      });
      recordAuditEntry(req, {
        action: 'create',
        entity: 'campaign',
        entityId: campaign.id,
        diff: { after: campaign },
      });

      // Dispatch webhook event (Issue #287)
      webhookService.dispatchEvent({
        type: WEBHOOK_EVENTS.CAMPAIGN_CREATED,
        campaignId: campaign.id,
        data: campaign,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        log.warn({ err, campaignId: campaign.id }, 'Failed to dispatch campaign.created webhook');
      });

      shortCache.clear();
      return res.status(201).json(campaign);
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
  function updateCampaign(req, res) {
    const result = campaignUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid campaign payload',
        code: 'VALIDATION_ERROR',
        details: formatZodErrors(result.error),
      });
    }

    const { name, description, active, rewardPerAction, startDate, endDate, featured, hidden, hiddenReason } = result.data;
    /** @type {Record<string, unknown>} */
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (active !== undefined) updateFields.active = active;
    if (featured !== undefined) updateFields.featured = featured;
    if (rewardPerAction !== undefined) updateFields.rewardPerAction = rewardPerAction;
    if (startDate !== undefined) updateFields.startDate = startDate;
    if (endDate !== undefined) updateFields.endDate = endDate;
    if (hidden !== undefined) updateFields.hidden = hidden;
    if (hiddenReason !== undefined) updateFields.hiddenReason = hiddenReason;

    const before = campaignRepository.getById(req.params.id);
    if (!before) {
      return res.status(404).json({ error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }

    const campaign = campaignRepository.update(req.params.id, updateFields);
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
      const eventType = isNowActive ? WEBHOOK_EVENTS.CAMPAIGN_ACTIVATED : WEBHOOK_EVENTS.CAMPAIGN_DEACTIVATED;
      webhookService.dispatchEvent({
        type: eventType,
        campaignId: campaign.id,
        data: campaign,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        log.warn({ err, campaignId: campaign.id, eventType }, 'Failed to dispatch campaign activation/deactivation webhook');
      });
    } else {
      // Dispatch generic update event
      webhookService.dispatchEvent({
        type: WEBHOOK_EVENTS.CAMPAIGN_UPDATED,
        campaignId: campaign.id,
        data: campaign,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
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
      webhookService.dispatchEvent({
        type: WEBHOOK_EVENTS.CAMPAIGN_DELETED,
        campaignId: req.params.id,
        data: before,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        log.warn({ err, campaignId: req.params.id }, 'Failed to dispatch campaign.deleted webhook');
      });
    }

    shortCache.clear();
    return res.status(204).end();
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

  /** @param {string} prefix */
  function registerApiRoutes(prefix) {
    app.get(prefix, rateLimiter, apiInfo);
    app.get(`${prefix}/config`, rateLimiter, getPublicConfig);
    app.get(`${prefix}/explorer`, rateLimiter, getExplorerLinks);
    app.get(`${prefix}/campaigns`, rateLimiter, listCampaigns);
    app.get(`${prefix}/campaigns/by-slug/:slug`, rateLimiter, getCampaignBySlug);
    app.get(`${prefix}/campaigns/:id`, rateLimiter, getCampaignById);
    app.get(`${prefix}/audit-logs`, rateLimiter, requireApiKey, listAuditLogs);
    app.get(`${prefix}/indexer/cursor`, rateLimiter, getIndexerCursorState);
    app.post(`${prefix}/indexer/cursor`, rateLimiter, requireApiKey, setIndexerCursorState);
    app.post(`${prefix}/campaigns`, rateLimiter, requireApiKey, createCampaign);
    app.put(`${prefix}/campaigns/:id`, rateLimiter, requireApiKey, updateCampaign);
    app.delete(`${prefix}/campaigns/:id`, rateLimiter, requireApiKey, deleteCampaign);

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

  return app.listen(port, () => {
    log.info({ port }, 'Trivela API running');
  });
}

const isExecutedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  startServer();
}
