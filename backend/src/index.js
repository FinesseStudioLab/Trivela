/**
 * Trivela Backend API
 * Serves campaign data, health, and Stellar/Soroban RPC proxy for the frontend.
 */

import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';
import createApiKeyAuth from './middleware/apiKeyAuth.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import logger from './middleware/logger.js';
import { paginateItems } from './pagination.js';
import { checkSorobanRpcHealth } from './sorobanRpc.js';
import { createDb } from './db.js';

const DEFAULT_PORT = 3001;
const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;
const DEFAULT_SHORT_CACHE_TTL_MS = 5_000;
const LEGACY_API_PREFIX = '/api';
const API_V1_PREFIX = '/api/v1';
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

function parseAllowedOrigins(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsOptions(allowedOrigins) {
  if (allowedOrigins.includes('*')) {
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
  };
}

function readOptionalConfigValue(options, envKey) {
  const fromOptions = options[envKey];
  if (typeof fromOptions === 'string' && fromOptions.trim().length > 0) {
    return fromOptions;
  }

  const fromEnv = process.env[envKey];
  return typeof fromEnv === 'string' ? fromEnv : '';
}

function validateContractId(value, label) {
  if (!value) {
    return '';
  }
  const normalized = value.trim();
  if (!CONTRACT_ID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid Stellar contract ID`);
  }
  return normalized;
}

function validateCampaignPayload(payload, { partial = false } = {}) {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['request body must be a JSON object'];
  }

  if (!partial || Object.hasOwn(payload, 'name')) {
    if (typeof payload.name !== 'string' || payload.name.trim().length === 0) {
      errors.push('name is required and must be a non-empty string');
    }
  }

  if (!partial || Object.hasOwn(payload, 'rewardPerAction')) {
    if (
      typeof payload.rewardPerAction !== 'number' ||
      !Number.isFinite(payload.rewardPerAction) ||
      payload.rewardPerAction < 0
    ) {
      errors.push('rewardPerAction is required and must be a non-negative number');
    }
  }

  if (Object.hasOwn(payload, 'description') && typeof payload.description !== 'string') {
    errors.push('description must be a string when provided');
  }

  if (Object.hasOwn(payload, 'active') && typeof payload.active !== 'boolean') {
    errors.push('active must be a boolean when provided');
  }

  return errors;
}


export function createApp(options = {}) {
  const apiKey = options.apiKey ?? process.env.TRIVELA_API_KEY ?? '';
  const corsAllowedOrigins =
    options.corsAllowedOrigins ?? process.env.CORS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN;
  const stellarNetwork = options.stellarNetwork ?? process.env.STELLAR_NETWORK ?? 'testnet';
  const sorobanRpcUrl = options.sorobanRpcUrl ?? process.env.SOROBAN_RPC_URL ?? DEFAULT_RPC_URL;
  const rewardsContractId = validateContractId(
    readOptionalConfigValue(options, 'REWARDS_CONTRACT_ID'),
    'REWARDS_CONTRACT_ID',
  );
  const campaignContractId = validateContractId(
    readOptionalConfigValue(options, 'CAMPAIGN_CONTRACT_ID'),
    'CAMPAIGN_CONTRACT_ID',
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const allowedOrigins = parseAllowedOrigins(corsAllowedOrigins);
  const rateLimitWindowMs = normalizePositiveInteger(
    options.rateLimit?.windowMs ?? process.env.RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
  );
  const rateLimitMaxRequests = normalizePositiveInteger(
    options.rateLimit?.maxRequests ?? process.env.RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  );

  // When an explicit campaigns seed is provided (legacy test path), use it;
  // otherwise fall back to the default "Welcome Campaign" row.
  const seed = options.campaigns ?? defaultSeed();
  const dbPath = options.dbPath ?? process.env.DB_PATH ?? ':memory:';
  const db = createDb(dbPath, seed);
  const shortCacheTtlMs = normalizePositiveInteger(
    options.shortCacheTtlMs ?? process.env.SHORT_CACHE_TTL_MS,
    DEFAULT_SHORT_CACHE_TTL_MS,
  );
  const shortCache = new Map();
  const indexerCursorState = {
    cursor: options.initialIndexerCursor ?? process.env.INDEXER_EVENT_CURSOR ?? null,
    updatedAt: new Date().toISOString(),
    source: options.initialIndexerCursor ?? process.env.INDEXER_EVENT_CURSOR ? 'env' : 'runtime',
  };

  const app = express();
  const metrics = {
    requestTotal: 0,
    requestErrors: 0,
    routeHits: new Map(),
  };
  const requireApiKey = createApiKeyAuth({ apiKey });
  const rateLimiter = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: rateLimitMaxRequests,
    timeProvider: options.rateLimit?.timeProvider,
  });

  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(logger);
  app.use(express.json());
  app.use((req, res, next) => {
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

  async function buildHealthPayload() {
    const rpc = await checkSorobanRpcHealth({
      rpcUrl: sorobanRpcUrl,
      fetchImpl,
    });

    return {
      status: rpc.status === 'ok' ? 'ok' : 'degraded',
      service: 'trivela-api',
      timestamp: new Date().toISOString(),
      rpc,
    };
  }

  app.get('/health', async (_req, res) => {
    const payload = await buildHealthPayload();
    res.json(payload);
  });

  app.get('/health/rpc', async (_req, res) => {
    const rpc = await checkSorobanRpcHealth({
      rpcUrl: sorobanRpcUrl,
      fetchImpl,
    });
    res.status(rpc.status === 'ok' ? 200 : 503).json(rpc);
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
        campaign: `GET ${API_V1_PREFIX}/campaigns/:id`,
        createCampaign: `POST ${API_V1_PREFIX}/campaigns`,
        updateCampaign: `PUT ${API_V1_PREFIX}/campaigns/:id`,
        deleteCampaign: `DELETE ${API_V1_PREFIX}/campaigns/:id`,
        config: `GET ${API_V1_PREFIX}/config`,
      },
      compatibility: {
        legacyPrefix: LEGACY_API_PREFIX,
        legacyRoutesSupported: true,
        migrationNote: 'Prefer /api/v1/* routes. Legacy /api/* routes remain available for compatibility.',
        usingLegacyPrefix,
      },
      stellar: {
        network: stellarNetwork,
        rpcUrl: sorobanRpcUrl,
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
    });
  }

  function getPublicConfig(_req, res) {
    res.json({
      sorobanRpcUrl,
      stellarNetwork,
      contractIds: {
        rewards: rewardsContractId || null,
        campaign: campaignContractId || null,
      },
    });
  }

  function listCampaigns(req, res) {
    const cacheKey = `campaigns:${req.originalUrl}`;
    const cached = shortCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.set('x-cache', 'HIT').json(cached.payload);
    }

    const activeFilter =
      req.query.active !== undefined
        ? req.query.active === 'true'
        : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const items = db.getAll({ active: activeFilter, q });
    const payload = paginateItems(items, req.query);
    shortCache.set(cacheKey, {
      expiresAt: Date.now() + shortCacheTtlMs,
      payload,
    });
    return res.set('x-cache', 'MISS').json(payload);
  }

  function getCampaignById(req, res) {
    const campaign = db.getById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    return res.json(campaign);
  }

  function createCampaign(req, res) {
    const errors = validateCampaignPayload(req.body, { partial: false });
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Invalid campaign payload',
        details: errors,
      });
    }

    const { name, description, rewardPerAction } = req.body;
    const campaign = db.create({
      name,
      description: description || '',
      rewardPerAction: rewardPerAction ?? 0,
    });
    shortCache.clear();
    return res.status(201).json(campaign);
  }

  function updateCampaign(req, res) {
    const errors = validateCampaignPayload(req.body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Invalid campaign payload',
        details: errors,
      });
    }

    const campaign = db.update(req.params.id, req.body);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    shortCache.clear();
    return res.json(campaign);
  }

  function deleteCampaign(req, res) {
    const deleted = db.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    shortCache.clear();
    return res.status(204).end();
  }

  function getIndexerCursorState(_req, res) {
    return res.json({
      cursor: indexerCursorState.cursor,
      updatedAt: indexerCursorState.updatedAt,
      source: indexerCursorState.source,
    });
  }

  function setIndexerCursorState(req, res) {
    const { cursor } = req.body ?? {};
    if (typeof cursor !== 'string' || cursor.trim().length === 0) {
      return res.status(400).json({ error: 'cursor is required and must be a non-empty string' });
    }
    indexerCursorState.cursor = cursor.trim();
    indexerCursorState.updatedAt = new Date().toISOString();
    indexerCursorState.source = 'api';
    return res.status(200).json({
      ok: true,
      cursor: indexerCursorState.cursor,
      updatedAt: indexerCursorState.updatedAt,
    });
  }

  function registerApiRoutes(prefix) {
    app.get(prefix, rateLimiter, apiInfo);
    app.get(`${prefix}/config`, rateLimiter, getPublicConfig);
    app.get(`${prefix}/campaigns`, rateLimiter, listCampaigns);
    app.get(`${prefix}/campaigns/:id`, rateLimiter, getCampaignById);
    app.get(`${prefix}/indexer/cursor`, rateLimiter, getIndexerCursorState);
    app.post(`${prefix}/indexer/cursor`, rateLimiter, requireApiKey, setIndexerCursorState);
    app.post(`${prefix}/campaigns`, rateLimiter, requireApiKey, createCampaign);
    app.put(`${prefix}/campaigns/:id`, rateLimiter, requireApiKey, updateCampaign);
    app.delete(`${prefix}/campaigns/:id`, rateLimiter, requireApiKey, deleteCampaign);
  }

  registerApiRoutes(API_V1_PREFIX);
  registerApiRoutes(LEGACY_API_PREFIX);

  return app;
}

export function startServer(options = {}) {
  const app = createApp(options);
  const port = options.port ?? process.env.PORT ?? DEFAULT_PORT;

  return app.listen(port, () => {
    console.log(`Trivela API running at http://localhost:${port}`);
  });
}

const isExecutedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  startServer();
}
