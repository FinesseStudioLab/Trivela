// Mixed scenario: 80 read VUs + 20 write VUs for 60s. Closest profile
// to expected production traffic.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultThresholds, writeHeaders } from '../lib/config.js';

export const options = {
  scenarios: {
    reads: {
      executor: 'constant-vus',
      vus: 80,
      duration: '60s',
      exec: 'readCampaigns',
    },
    writes: {
      executor: 'constant-vus',
      vus: 20,
      duration: '60s',
      exec: 'createCampaign',
    },
  },
  thresholds: defaultThresholds,
};

export function readCampaigns() {
  const res = http.get(`${BASE_URL}/api/v1/campaigns?limit=20`);
  check(res, { 'read 2xx': (r) => r.status >= 200 && r.status < 300 });
  sleep(0.1);
}

export function createCampaign() {
  const slug = `mixed-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({
    name: `Mixed ${slug}`,
    slug,
    description: 'mixed-read-write.js',
    rewardPerAction: 1,
    active: true,
  });
  const res = http.post(`${BASE_URL}/api/v1/campaigns`, body, {
    headers: writeHeaders(),
  });
  check(res, { 'write 2xx': (r) => r.status >= 200 && r.status < 300 });
  sleep(0.5);
}
