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
const LEGACY_API_PREFIX = '/api';
const API_V1_PREFIX = '/api/v1';

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

function cloneCampaigns(campaigns) {
  return campaigns.map((campaign) => ({ ...campaign }));
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

function nextCampaignId(campaigns) {
  const maxId = campaigns.reduce((currentMax, campaign) => {
    const parsed = Number.parseInt(campaign.id, 10);
    return Number.isFinite(parsed) ? Math.max(currentMax, parsed) : currentMax;
  }, 0);

  return String(maxId + 1);
}

export function createApp(options = {}) {
  const apiKey = options.apiKey ?? process.env.TRIVELA_API_KEY ?? '';
  const corsOriginConfig =
    options.corsAllowedOrigins ?? process.env.CORS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN;
  const corsAllowedOrigins =
    typeof corsOriginConfig === 'string' && corsOriginConfig.trim().length > 0
      ? corsOriginConfig
      : process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:5173';
  const stellarNetwork = options.stellarNetwork ?? process.env.STELLAR_NETWORK ?? 'testnet';
  const sorobanRpcUrl = options.sorobanRpcUrl ?? process.env.SOROBAN_RPC_URL ?? DEFAULT_RPC_URL;
  const rewardsContractId = readOptionalConfigValue(options, 'REWARDS_CONTRACT_ID');
  const campaignContractId = readOptionalConfigValue(options, 'CAMPAIGN_CONTRACT_ID');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const campaigns = cloneCampaigns(options.campaigns ?? defaultCampaigns());
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
  const db = createDb(dbPath, seed);

  const app = express();
  const requireApiKey = createApiKeyAuth({ apiKey });
  const rateLimiter = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: rateLimitMaxRequests,
    timeProvider: options.rateLimit?.timeProvider,
  });

  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(logger);
  app.use(express.json());

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
    const activeFilter =
      req.query.active !== undefined
        ? req.query.active === 'true'
        : undefined;
    const items = db.getAll({ active: activeFilter });
    res.json(paginateItems(items, req.query));
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

    const campaign = {
      id: nextCampaignId(campaigns),
      name,
      description: description || '',
      active: true,
      rewardPerAction: rewardPerAction ?? 0,
      createdAt: new Date().toISOString(),
    };

    campaigns.push(campaign);
    return res.status(201).json(campaign);
  }

  function updateCampaign(req, res) {
    const existing = db.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const errors = validateCampaignPayload(req.body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Invalid campaign payload',
        details: errors,
      });
    }

    Object.assign(campaign, req.body, { id: campaign.id });
    return res.json(campaign);
  }

  function deleteCampaign(req, res) {
    const deleted = db.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    return res.status(204).end();
  }

  function registerApiRoutes(prefix) {
    app.get(prefix, rateLimiter, apiInfo);
    app.get(`${prefix}/config`, rateLimiter, getPublicConfig);
    app.get(`${prefix}/campaigns`, rateLimiter, listCampaigns);
    app.get(`${prefix}/campaigns/:id`, rateLimiter, getCampaignById);
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
