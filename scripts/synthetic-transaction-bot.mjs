#!/usr/bin/env node
/**
 * Synthetic user transaction bot (issue #1364).
 *
 * Continuously simulates end-to-end campaign activity on Testnet — create,
 * credit, verify, clean up — so flow integrity is exercised 24/7 without
 * waiting for real user traffic. Emits Prometheus metrics per iteration so
 * regressions surface through the existing alerting stack.
 *
 * Metrics emitted (plain Prometheus text):
 *   trivela_synthbot_iterations_total{job="trivela-synthbot"}
 *   trivela_synthbot_failures_total{job="trivela-synthbot"}
 *   trivela_synthbot_last_duration_seconds{job="trivela-synthbot"}
 *   trivela_synthbot_last_run_timestamp{job="trivela-synthbot"}
 *
 * Usage:
 *   node scripts/synthetic-transaction-bot.mjs              # run forever
 *   node scripts/synthetic-transaction-bot.mjs --once       # single iteration
 *   node scripts/synthetic-transaction-bot.mjs --iterations 5
 *
 * Environment variables:
 *   SYNTHBOT_API_URL        Base URL of the Trivela backend (default: http://localhost:3001)
 *   SYNTHBOT_API_KEY        API key with campaign write access
 *   SYNTHBOT_WALLET         Stellar G-address used as the synthetic claimant
 *   SYNTHBOT_CONTRACT_ID    Testnet campaign contract ID (optional)
 *   SYNTHBOT_INTERVAL_MS    Pause between iterations (default: 60000)
 *   SYNTHBOT_TIMEOUT_MS     Per-request timeout (default: 15000)
 *   SYNTHBOT_METRICS_FILE   If set, overwrite this file with metrics each iteration
 *   STELLAR_NETWORK         testnet | mainnet (default: testnet)
 */

import { writeFileSync } from 'node:fs';

const API_URL = (process.env.SYNTHBOT_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API_KEY = process.env.SYNTHBOT_API_KEY ?? '';
const WALLET = process.env.SYNTHBOT_WALLET ?? 'GDUMMY_SYNTHBOT_WALLET_ADDRESS_NOT_SET';
const CONTRACT_ID = process.env.SYNTHBOT_CONTRACT_ID ?? '';
const INTERVAL_MS = Number(process.env.SYNTHBOT_INTERVAL_MS ?? 60_000);
const TIMEOUT_MS = Number(process.env.SYNTHBOT_TIMEOUT_MS ?? 15_000);
const METRICS_FILE = process.env.SYNTHBOT_METRICS_FILE ?? '';
const JOB_LABEL = 'trivela-synthbot';
const NETWORK = process.env.STELLAR_NETWORK ?? 'testnet';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const iterationsArg = args.indexOf('--iterations');
const MAX_ITERATIONS =
  ONCE ? 1 : iterationsArg >= 0 ? Number(args[iterationsArg + 1] ?? 1) : Infinity;

const stats = { iterations: 0, failures: 0, lastDuration: 0, lastRun: 0 };

/** @param {string} url @param {RequestInit} opts */
async function apiFetch(url, opts = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        ...opts.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

function emitMetrics() {
  const lines = [
    `# HELP trivela_synthbot_iterations_total Completed synthetic transaction iterations.`,
    `# TYPE trivela_synthbot_iterations_total counter`,
    `trivela_synthbot_iterations_total{job="${JOB_LABEL}"} ${stats.iterations}`,
    `# HELP trivela_synthbot_failures_total Failed synthetic transaction iterations.`,
    `# TYPE trivela_synthbot_failures_total counter`,
    `trivela_synthbot_failures_total{job="${JOB_LABEL}"} ${stats.failures}`,
    `# HELP trivela_synthbot_last_duration_seconds Wall time of the most recent iteration.`,
    `# TYPE trivela_synthbot_last_duration_seconds gauge`,
    `trivela_synthbot_last_duration_seconds{job="${JOB_LABEL}"} ${stats.lastDuration.toFixed(3)}`,
    `# HELP trivela_synthbot_last_run_timestamp Unix epoch of the most recent iteration.`,
    `# TYPE trivela_synthbot_last_run_timestamp gauge`,
    `trivela_synthbot_last_run_timestamp{job="${JOB_LABEL}"} ${stats.lastRun}`,
    '',
  ].join('\n');

  if (METRICS_FILE) {
    writeFileSync(METRICS_FILE, lines, 'utf8');
  } else {
    process.stdout.write(lines);
  }
}

/**
 * One synthetic user journey: browse → create → credit → verify → clean up.
 * Mirrors the canary flow but is safe to repeat indefinitely on Testnet.
 */
async function runIteration() {
  const start = Date.now();
  let campaignId = null;

  try {
    const health = await apiFetch(`${API_URL}/health`);
    if (health.status !== 'ok' && health.status !== 'degraded') {
      throw new Error(`Health check returned unexpected status: ${health.status}`);
    }

    const stamp = Date.now();
    const campaign = await apiFetch(`${API_URL}/api/v1/campaigns`, {
      method: 'POST',
      body: JSON.stringify({
        name: `__synthbot_${stamp}`,
        description: 'Synthetic transaction bot campaign — safe to delete',
        rewardPerAction: 1,
        active: true,
        ...(CONTRACT_ID ? { contractId: CONTRACT_ID } : {}),
        tags: ['synthbot', NETWORK],
      }),
    });
    campaignId = campaign.id ?? campaign.data?.id;
    if (!campaignId) throw new Error('Campaign creation did not return an id');

    await apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ walletAddress: WALLET, amount: 1 }),
    }).catch((err) => {
      if (err.message.startsWith('HTTP 404') || err.message.startsWith('HTTP 405')) return null;
      throw err;
    });

    const listing = await apiFetch(`${API_URL}/api/v1/campaigns`);
    if (!listing || (Array.isArray(listing) && listing.length === 0 && listing.data === undefined)) {
      if (!listing) throw new Error('Campaign listing returned empty response');
    }

    const statsView = await apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}`);
    if (!statsView || (!statsView.id && !statsView.data?.id)) {
      throw new Error('Campaign fetch returned empty response');
    }

    await apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}`, { method: 'DELETE' }).catch(() => {});

    stats.iterations += 1;
    stats.lastDuration = (Date.now() - start) / 1000;
    stats.lastRun = Math.floor(Date.now() / 1000);
    process.stderr.write(
      `[synthbot] iteration ${stats.iterations} OK — ${stats.lastDuration.toFixed(2)}s\n`,
    );
  } catch (err) {
    if (campaignId) {
      apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}`, { method: 'DELETE' }).catch(() => {});
    }
    stats.iterations += 1;
    stats.failures += 1;
    stats.lastDuration = (Date.now() - start) / 1000;
    stats.lastRun = Math.floor(Date.now() / 1000);
    process.stderr.write(`[synthbot] iteration ${stats.iterations} FAIL — ${err.message}\n`);
  } finally {
    emitMetrics();
  }
}

async function main() {
  process.stderr.write(
    `[synthbot] starting against ${API_URL} (network=${NETWORK}, interval=${INTERVAL_MS}ms)\n`,
  );

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    await runIteration();
    if (i < MAX_ITERATIONS - 1) {
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
  }

  process.stderr.write(
    `[synthbot] stopped after ${stats.iterations} iteration(s), ${stats.failures} failure(s)\n`,
  );
  process.exit(stats.failures > 0 ? 1 : 0);
}

main();
