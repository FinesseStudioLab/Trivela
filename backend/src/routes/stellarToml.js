// #551 — SEP-1 stellar.toml publishing for reward token metadata.
// Wallets and explorers (Lobstr, StellarExpert, etc.) call /.well-known/stellar.toml
// to discover asset names, decimals, and images.

import { Router } from 'express';

const TOML_MAX_AGE_SECONDS = 3600; // 1 hour

/**
 * Parse a TOML-safe value: strip characters that would break a TOML inline string.
 * @param {string} value
 * @returns {string}
 */
function escapeTOML(value) {
  return String(value ?? '').replace(/["\\]/g, '');
}

/**
 * Build the stellar.toml text from a list of currency configs.
 *
 * @param {{
 *   organizationName?: string;
 *   organizationUrl?: string;
 *   currencies: Array<{
 *     code: string;
 *     issuer: string;
 *     name?: string;
 *     desc?: string;
 *     image?: string;
 *     decimals?: number;
 *   }>;
 * }} config
 * @returns {string}
 */
export function buildStellarToml({ organizationName, organizationUrl, currencies = [] }) {
  const lines = [];

  lines.push('# Trivela SEP-0001 Stellar TOML');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('[DOCUMENTATION]');
  if (organizationName) lines.push(`ORG_NAME = "${escapeTOML(organizationName)}"`);
  if (organizationUrl) lines.push(`ORG_URL = "${escapeTOML(organizationUrl)}"`);
  lines.push('');

  if (currencies.length === 0) {
    lines.push('# No reward tokens configured.');
  }

  for (const cur of currencies) {
    lines.push('[[CURRENCIES]]');
    lines.push(`code = "${escapeTOML(cur.code)}"`);
    lines.push(`issuer = "${escapeTOML(cur.issuer)}"`);
    if (cur.name) lines.push(`name = "${escapeTOML(cur.name)}"`);
    if (cur.desc) lines.push(`desc = "${escapeTOML(cur.desc)}"`);
    if (cur.image) lines.push(`image = "${escapeTOML(cur.image)}"`);
    lines.push(`decimals = ${Number.isFinite(cur.decimals) ? cur.decimals : 7}`);
    lines.push(`is_asset_anchored = false`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse the REWARD_TOKEN_* env vars into a currency list.
 * Supports multiple tokens via REWARD_TOKEN_0_CODE / REWARD_TOKEN_1_CODE etc.,
 * or a single token via REWARD_TOKEN_CODE.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Array<{ code: string; issuer: string; name?: string; desc?: string; image?: string; decimals?: number }>}
 */
export function parseCurrenciesFromEnv(env = process.env) {
  const currencies = [];

  // Multi-token: REWARD_TOKEN_0_CODE, REWARD_TOKEN_0_ISSUER, ...
  for (let i = 0; i < 10; i++) {
    const code = env[`REWARD_TOKEN_${i}_CODE`];
    const issuer = env[`REWARD_TOKEN_${i}_ISSUER`];
    if (code && issuer) {
      currencies.push({
        code,
        issuer,
        name: env[`REWARD_TOKEN_${i}_NAME`],
        desc: env[`REWARD_TOKEN_${i}_DESC`],
        image: env[`REWARD_TOKEN_${i}_IMAGE`],
        decimals: env[`REWARD_TOKEN_${i}_DECIMALS`] != null
          ? Number(env[`REWARD_TOKEN_${i}_DECIMALS`])
          : 7,
      });
    }
  }

  // Single-token shorthand
  if (currencies.length === 0 && env.REWARD_TOKEN_CODE && env.REWARD_TOKEN_ISSUER) {
    currencies.push({
      code: env.REWARD_TOKEN_CODE,
      issuer: env.REWARD_TOKEN_ISSUER,
      name: env.REWARD_TOKEN_NAME,
      desc: env.REWARD_TOKEN_DESC,
      image: env.REWARD_TOKEN_IMAGE,
      decimals: env.REWARD_TOKEN_DECIMALS != null ? Number(env.REWARD_TOKEN_DECIMALS) : 7,
    });
  }

  return currencies;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv }} options
 * @returns {Router}
 */
export function createStellarTomlRoute({ env = process.env } = {}) {
  const router = Router();

  // In-memory cache to avoid rebuilding on every request
  let cached = null;
  let cachedAt = 0;

  router.get('/.well-known/stellar.toml', (req, res) => {
    const now = Date.now();

    if (!cached || now - cachedAt > TOML_MAX_AGE_SECONDS * 1000) {
      const currencies = parseCurrenciesFromEnv(env);
      cached = buildStellarToml({
        organizationName: env.ORG_NAME ?? 'Trivela',
        organizationUrl: env.ORG_URL,
        currencies,
      });
      cachedAt = now;
    }

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${TOML_MAX_AGE_SECONDS}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(cached);
  });

  // Admin cache invalidation (e.g. after token config change)
  router.post('/.well-known/stellar.toml/invalidate', (req, res) => {
    cached = null;
    cachedAt = 0;
    res.json({ ok: true, message: 'stellar.toml cache invalidated' });
  });

  return router;
}
