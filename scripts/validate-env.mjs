#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function validateFrontendEnv(env) {
  const errors = [];
  const supportedNetworks = ['testnet', 'mainnet'];
  const contractPattern = /^C[A-Z2-7]{55}$/;

  if (env.VITE_API_URL) {
    try {
      const parsed = new URL(env.VITE_API_URL);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push(`VITE_API_URL must be http(s): "${env.VITE_API_URL}"`);
      }
    } catch {
      errors.push(`VITE_API_URL must be a valid URL: "${env.VITE_API_URL}"`);
    }
  }

  if (env.VITE_STELLAR_NETWORK) {
    const n = String(env.VITE_STELLAR_NETWORK).trim().toLowerCase();
    if (!supportedNetworks.includes(n)) {
      errors.push(`VITE_STELLAR_NETWORK must be one of: ${supportedNetworks.join(', ')}`);
    }
  }

  if (
    env.VITE_REWARDS_CONTRACT_ID &&
    !contractPattern.test(String(env.VITE_REWARDS_CONTRACT_ID).trim())
  ) {
    errors.push('VITE_REWARDS_CONTRACT_ID must be a valid Stellar contract ID');
  }

  if (
    env.VITE_CAMPAIGN_CONTRACT_ID &&
    !contractPattern.test(String(env.VITE_CAMPAIGN_CONTRACT_ID).trim())
  ) {
    errors.push('VITE_CAMPAIGN_CONTRACT_ID must be a valid Stellar contract ID');
  }

  if (errors.length > 0) {
    throw new Error(['Invalid frontend env file:', ...errors.map((e) => `- ${e}`)].join('\n'));
  }
}

function validateBackendEnv(env) {
  const errors = [];
  const supportedNetworks = ['testnet', 'mainnet'];

  const validatePositiveInt = (value, label) => {
    if (value === undefined || value === null || value === '') return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) errors.push(`${label} must be a positive integer`);
  };

  validatePositiveInt(env.PORT, 'PORT');
  validatePositiveInt(env.RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS');
  validatePositiveInt(env.RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_MAX_REQUESTS');
  validatePositiveInt(env.SHORT_CACHE_TTL_MS, 'SHORT_CACHE_TTL_MS');

  if (env.STELLAR_NETWORK) {
    const n = String(env.STELLAR_NETWORK).trim().toLowerCase();
    if (!supportedNetworks.includes(n)) {
      errors.push(`STELLAR_NETWORK must be one of: ${supportedNetworks.join(', ')}`);
    }
  }

  const cors = env.CORS_ALLOWED_ORIGINS ?? env.CORS_ORIGIN;
  if (cors) {
    const origins = String(cors)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (origins.length === 0)
      errors.push('CORS_ALLOWED_ORIGINS must include at least one origin when set');
    if (!origins.includes('*')) {
      for (const origin of origins) {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors.push(`CORS_ALLOWED_ORIGINS origin must be http(s): "${origin}"`);
          }
        } catch {
          errors.push(`CORS_ALLOWED_ORIGINS contains an invalid origin: "${origin}"`);
        }
      }
    }
  }

  const rawKeys = env.TRIVELA_API_KEYS ?? env.TRIVELA_API_KEY;
  if (rawKeys) {
    const keys = String(rawKeys)
      .split(',')
      .map((k) => k.trim());
    if (keys.some((k) => !k))
      errors.push('TRIVELA_API_KEYS contains an empty key (check for trailing commas)');
  }

  if (errors.length > 0) {
    throw new Error(['Invalid backend env file:', ...errors.map((e) => `- ${e}`)].join('\n'));
  }
}

async function main() {
  const backendEnvPath = path.join(repoRoot, 'backend', '.env.example');
  const frontendEnvPath = path.join(repoRoot, 'frontend', '.env.example');

  const backendEnv = parseEnvFile(backendEnvPath);
  const frontendEnv = parseEnvFile(frontendEnvPath);

  validateBackendEnv(backendEnv);
  validateFrontendEnv(frontendEnv);

  console.log('Environment validation OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
