/**
 * Synthetic user transaction bot (#1364).
 *
 * Continuously simulates campaign activity against a running Trivela backend
 * (typically Testnet) and records per-step results so end-to-end flow
 * regressions surface without real users.
 *
 * Usage: node src/testing/syntheticBot.js
 *   BOT_BASE_URL     backend URL (default http://localhost:3001)
 *   BOT_API_KEY      optional API key sent as x-api-key
 *   BOT_INTERVAL_MS  delay between cycles (default 60000, min 1000)
 *   BOT_TIMEOUT_MS   per-request timeout (default 10000)
 *   BOT_FAILURE_THRESHOLD consecutive failed cycles before "unhealthy" (default 3)
 */
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  baseUrl: 'http://localhost:3001',
  intervalMs: 60_000,
  timeoutMs: 10_000,
  failureThreshold: 3,
};

function positiveInt(value, fallback, min = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

export function resolveConfig(env = process.env) {
  const baseUrl = (env.BOT_BASE_URL || DEFAULTS.baseUrl).replace(/\/+$/, '');
  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`Invalid BOT_BASE_URL: ${baseUrl}`);
  }
  return {
    baseUrl,
    apiKey: env.BOT_API_KEY || undefined,
    intervalMs: positiveInt(env.BOT_INTERVAL_MS, DEFAULTS.intervalMs, 1000),
    timeoutMs: positiveInt(env.BOT_TIMEOUT_MS, DEFAULTS.timeoutMs),
    failureThreshold: positiveInt(env.BOT_FAILURE_THRESHOLD, DEFAULTS.failureThreshold),
  };
}

export function createSyntheticBot({
  baseUrl = DEFAULTS.baseUrl,
  apiKey,
  timeoutMs = DEFAULTS.timeoutMs,
  failureThreshold = DEFAULTS.failureThreshold,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');

  const stats = {
    cycles: 0,
    failedCycles: 0,
    consecutiveFailures: 0,
    steps: {},
    lastCycleAt: null,
    lastError: null,
  };

  async function request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${path} responded ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function step(name, fn) {
    const started = now();
    const bucket = (stats.steps[name] ||= { ok: 0, failed: 0, lastMs: 0 });
    try {
      const value = await fn();
      bucket.ok += 1;
      return { name, ok: true, ms: now() - started, value };
    } catch (err) {
      bucket.failed += 1;
      return { name, ok: false, ms: now() - started, error: err?.message || String(err) };
    } finally {
      bucket.lastMs = now() - started;
    }
  }

  /** Runs one simulated user journey: health -> browse -> open campaign -> stats. */
  async function runCycle() {
    const results = [];
    results.push(await step('health', () => request('/health')));

    const list = await step('list-campaigns', async () => {
      const body = await request('/api/v1/campaigns');
      const items = Array.isArray(body) ? body : body?.data ?? body?.campaigns;
      if (!Array.isArray(items)) throw new Error('campaign list has unexpected shape');
      return items;
    });
    results.push(list);

    const campaigns = list.ok ? list.value : [];
    if (list.ok && campaigns.length > 0) {
      const pick = campaigns[Math.floor(Math.random() * campaigns.length)];
      const id = encodeURIComponent(String(pick?.id ?? ''));
      if (!pick?.id) {
        results.push({ name: 'get-campaign', ok: false, ms: 0, error: 'campaign missing id' });
      } else {
        results.push(await step('get-campaign', () => request(`/api/v1/campaigns/${id}`)));
        results.push(await step('campaign-stats', () => request(`/api/v1/campaigns/${id}/stats`)));
      }
    }

    const ok = results.every((r) => r.ok);
    stats.cycles += 1;
    stats.lastCycleAt = new Date(now()).toISOString();
    if (ok) {
      stats.consecutiveFailures = 0;
    } else {
      stats.failedCycles += 1;
      stats.consecutiveFailures += 1;
      stats.lastError = results.find((r) => !r.ok)?.error ?? null;
      logger.warn?.(`[synthetic-bot] cycle failed: ${stats.lastError}`);
    }
    return { ok, results };
  }

  function getStatus() {
    return {
      ...stats,
      steps: structuredClone(stats.steps),
      healthy: stats.consecutiveFailures < failureThreshold,
    };
  }

  /** Loops until the signal aborts. Cycle errors never stop the loop. */
  async function run({ intervalMs = DEFAULTS.intervalMs, signal } = {}) {
    while (!signal?.aborted) {
      try {
        await runCycle();
      } catch (err) {
        logger.error?.(`[synthetic-bot] unexpected error: ${err?.message || err}`);
      }
      await new Promise((resolve) => {
        const t = setTimeout(resolve, intervalMs);
        signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
  }

  return { runCycle, run, getStatus };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = resolveConfig();
  const bot = createSyntheticBot(config);
  const ac = new AbortController();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => ac.abort());
  console.log(`[synthetic-bot] targeting ${config.baseUrl} every ${config.intervalMs}ms`);
  bot.run({ intervalMs: config.intervalMs, signal: ac.signal }).then(() => {
    console.log('[synthetic-bot] stopped', JSON.stringify(bot.getStatus()));
  });
}
