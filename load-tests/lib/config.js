// k6 helpers shared by every scenario. Centralises BASE_URL / API_KEY
// resolution and the project-wide pass/fail thresholds so individual
// scenarios stay declarative.

const DEFAULT_LATENCY_P95_MS = 200;
const DEFAULT_ERROR_RATE = 0.01;

export const BASE_URL = (__ENV.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export const API_KEY = __ENV.API_KEY ?? '';

function parsePositiveNumber(raw, fallback) {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const LATENCY_P95_MS = parsePositiveNumber(__ENV.LATENCY_P95_MS, DEFAULT_LATENCY_P95_MS);
export const ERROR_RATE_THRESHOLD = parsePositiveNumber(
  __ENV.ERROR_RATE_THRESHOLD,
  DEFAULT_ERROR_RATE,
);

/**
 * Project pass/fail gates. Each scenario spreads these into its `options`
 * so we have one source of truth.
 */
export const defaultThresholds = {
  'http_req_duration{expected_response:true}': [`p(95)<${LATENCY_P95_MS}`],
  http_req_failed: [`rate<${ERROR_RATE_THRESHOLD}`],
};

/**
 * Build headers for write requests. Returns an empty object when no API
 * key is configured so scenarios can still smoke-test against an open
 * backend.
 */
export function writeHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  return headers;
}
