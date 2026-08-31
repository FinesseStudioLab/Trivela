// Read-heavy scenario: 100 VUs hammering GET /api/v1/campaigns for 30s.
// Validates that the public list endpoint stays under 200ms p95 and
// errors below 1% under the default rate limit (60 req/min/IP).

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultThresholds } from '../lib/config.js';

export const options = {
  scenarios: {
    read_campaigns: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30s',
    },
  },
  thresholds: defaultThresholds,
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/campaigns?limit=20`);
  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'response has data array': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body) || Array.isArray(body.data);
      } catch (_err) {
        return false;
      }
    },
  });
  // Light pacing so we don't blow past the rate limiter immediately.
  sleep(0.1);
}
