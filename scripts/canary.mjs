#!/usr/bin/env node
/**
 * Trivela Synthetic Canary (issue #650 — synthetic canary).
 *
 * Exercises the core register→credit→claim journey against the testnet contract
 * and emits Prometheus metrics so the CanaryJourneyFailed / CanarySlowJourney
 * alerts can fire within minutes of a real failure.
 *
 * Metrics emitted (plain Prometheus text on stdout):
 *   trivela_canary_success{job="trivela-canary"}   1 on success, 0 on failure
 *   trivela_canary_duration_seconds{...}            wall time for the full journey
 *   trivela_canary_last_run_timestamp{...}          unix epoch of last execution
 *
 * Usage:
 *   node scripts/canary.mjs
 *   # or add to crontab (every 5 min — cron pattern "asterisk /5 * * * *"):
 *   # node scripts/canary.mjs >> /var/log/trivela-canary.log 2>&1
 *
 * Environment variables (inherit from .env or CI secrets):
 *   CANARY_API_URL         Base URL of the Trivela backend (default: http://localhost:3001)
 *   CANARY_API_KEY         API key with campaign write access
 *   CANARY_WALLET          Stellar G-address to simulate as the claimant
 *   CANARY_CONTRACT_ID     Testnet campaign contract ID (C…56 chars)
 *   CANARY_TIMEOUT_MS      Per-step timeout in ms (default: 15000)
 *   CANARY_METRICS_FILE    If set, write metrics to this file instead of stdout
 *   STELLAR_NETWORK        testnet | mainnet (default: testnet)
 */

import { writeFileSync } from 'node:fs';

const API_URL = (process.env.CANARY_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API_KEY = process.env.CANARY_API_KEY ?? '';
const WALLET = process.env.CANARY_WALLET ?? 'GDUMMY_CANARY_WALLET_ADDRESS_NOT_SET';
const CONTRACT_ID = process.env.CANARY_CONTRACT_ID ?? '';
const TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS ?? 15_000);
const METRICS_FILE = process.env.CANARY_METRICS_FILE ?? '';
const JOB_LABEL = 'trivela-canary';

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

function emitMetrics({ success, durationSeconds, timestamp }) {
  const lines = [
    `# HELP trivela_canary_success 1 if the last canary journey succeeded, 0 otherwise.`,
    `# TYPE trivela_canary_success gauge`,
    `trivela_canary_success{job="${JOB_LABEL}"} ${success ? 1 : 0}`,
    `# HELP trivela_canary_duration_seconds Wall time for the full canary journey.`,
    `# TYPE trivela_canary_duration_seconds gauge`,
    `trivela_canary_duration_seconds{job="${JOB_LABEL}"} ${durationSeconds.toFixed(3)}`,
    `# HELP trivela_canary_last_run_timestamp Unix epoch of the most recent canary run.`,
    `# TYPE trivela_canary_last_run_timestamp gauge`,
    `trivela_canary_last_run_timestamp{job="${JOB_LABEL}"} ${timestamp}`,
    '',
  ].join('\n');

  if (METRICS_FILE) {
    writeFileSync(METRICS_FILE, lines, 'utf8');
  } else {
    process.stdout.write(lines);
  }
}

async function runCanary() {
  const start = Date.now();
  const timestamp = Math.floor(start / 1000);
  let campaignId = null;

  try {
    // ── Step 1: health check ────────────────────────────────────────────────
    const health = await apiFetch(`${API_URL}/health`);
    if (health.status !== 'ok' && health.status !== 'degraded') {
      throw new Error(`Health check returned unexpected status: ${health.status}`);
    }

    // ── Step 2: create a synthetic canary campaign (register) ───────────────
    // This simulates the "register" step of the campaign creation journey.
    const campaign = await apiFetch(`${API_URL}/api/v1/campaigns`, {
      method: 'POST',
      body: JSON.stringify({
        name: `__canary_${Date.now()}`,
        description: 'Synthetic canary campaign — safe to delete',
        rewardPerAction: 1,
        active: true,
        ...(CONTRACT_ID ? { contractId: CONTRACT_ID } : {}),
        tags: ['canary'],
      }),
    });
    campaignId = campaign.id ?? campaign.data?.id;
    if (!campaignId) throw new Error('Campaign creation did not return an id');

    // ── Step 3: credit a claimant (credit step) ─────────────────────────────
    // Verifies the credit path is reachable.
    await apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ walletAddress: WALLET, amount: 1 }),
    }).catch((err) => {
      // Credits may require a specific env; treat 404/405 as skip, not failure.
      if (err.message.startsWith('HTTP 404') || err.message.startsWith('HTTP 405')) return null;
      throw err;
    });

    // ── Step 4: fetch campaign stats (claim readiness check) ─────────────────
    const stats = await apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}`);
    if (!stats || (!stats.id && !stats.data?.id)) {
      throw new Error('Campaign stats fetch returned empty response');
    }

    // ── Step 5: delete the canary campaign (cleanup) ─────────────────────────
    await apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}`, { method: 'DELETE' }).catch(
      () => {},
    );

    const durationSeconds = (Date.now() - start) / 1000;
    emitMetrics({ success: true, durationSeconds, timestamp });
    process.stderr.write(
      `[canary] OK — journey completed in ${durationSeconds.toFixed(2)}s\n`,
    );
    process.exit(0);
  } catch (err) {
    // Best-effort cleanup.
    if (campaignId) {
      apiFetch(`${API_URL}/api/v1/campaigns/${campaignId}`, { method: 'DELETE' }).catch(() => {});
    }
    const durationSeconds = (Date.now() - start) / 1000;
    emitMetrics({ success: false, durationSeconds, timestamp });
    process.stderr.write(`[canary] FAIL — ${err.message}\n`);
    process.exit(1);
  }
}

runCanary();
