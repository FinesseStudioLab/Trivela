// Burst registration scenario: Simulates a spike of users registering
// simultaneously (e.g., after a social media post or influencer mention).
// Tests the backend's ability to handle sudden traffic bursts.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultThresholds } from '../lib/config.js';

export const options = {
  scenarios: {
    burst_registration: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 }, // Ramp up to 50 users
        { duration: '30s', target: 200 }, // Burst to 200 users
        { duration: '20s', target: 200 }, // Hold the burst
        { duration: '10s', target: 0 }, // Ramp down
      ],
    },
  },
  thresholds: {
    ...defaultThresholds,
    // More lenient threshold for burst scenario
    'http_req_duration{expected_response:true}': ['p(95)<500'],
    http_req_failed: ['rate<0.05'], // Allow 5% error rate during burst
  },
};

export default function () {
  // Simulate user registration flow
  const userId = `user-${__VU}-${__ITER}-${Date.now()}`;
  const walletAddress = `G${randomBase32(55)}`; // Mock Stellar address

  const payload = JSON.stringify({
    userId,
    walletAddress,
    email: `${userId}@example.com`,
    referralCode: Math.random() > 0.7 ? 'BURST2024' : null,
  });

  const res = http.post(`${BASE_URL}/api/v1/users/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'registration succeeded': (r) => r.status === 201 || r.status === 200,
    'response has userId': (r) => {
      try {
        const body = r.json();
        return body.userId || body.data?.userId;
      } catch (_err) {
        return false;
      }
    },
    'not rate limited': (r) => r.status !== 429,
  });

  // Minimal sleep to simulate rapid burst
  sleep(0.05);
}

// Helper to generate base32-like strings for mock Stellar addresses
function randomBase32(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
