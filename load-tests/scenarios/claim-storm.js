// Claim storm scenario: Simulates a sudden wave of reward claims
// (e.g., when a popular campaign expires or a high-value bonus is announced).
// Tests the backend's ability to handle concurrent claim processing and
// potential race conditions in reward distribution.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultThresholds, writeHeaders } from '../lib/config.js';

export const options = {
  scenarios: {
    claim_storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 30 }, // Quick ramp to 30 users
        { duration: '20s', target: 150 }, // Storm to 150 users
        { duration: '30s', target: 150 }, // Sustain the storm
        { duration: '15s', target: 30 }, // Wind down
        { duration: '5s', target: 0 }, // Stop
      ],
    },
  },
  thresholds: {
    ...defaultThresholds,
    // Claims are more expensive (DB writes + potential external calls)
    'http_req_duration{expected_response:true}': ['p(95)<800'],
    http_req_failed: ['rate<0.03'], // Allow 3% error rate for claims
  },
};

export default function () {
  // Simulate a user attempting to claim rewards
  const userId = `claimant-${__VU}-${__ITER}`;
  const campaignSlug = selectCampaign();

  // First, check available rewards for this campaign
  const checkRes = http.get(
    `${BASE_URL}/api/v1/campaigns/${campaignSlug}/rewards?userId=${userId}`,
    { headers: writeHeaders() },
  );

  const hasRewards = check(checkRes, {
    'rewards check succeeded': (r) => r.status >= 200 && r.status < 300,
  });

  // If rewards are available, attempt to claim them
  if (hasRewards) {
    const claimPayload = JSON.stringify({
      userId,
      campaignSlug,
      actions: ['SHARE', 'FOLLOW', 'RETWEET'].slice(0, Math.ceil(Math.random() * 3)),
      timestamp: Date.now(),
    });

    const claimRes = http.post(`${BASE_URL}/api/v1/campaigns/${campaignSlug}/claim`, claimPayload, {
      headers: writeHeaders(),
    });

    check(claimRes, {
      'claim processed': (r) => r.status === 200 || r.status === 201,
      'claim has transaction': (r) => {
        try {
          const body = r.json();
          return body.transactionId || body.data?.transactionId || body.txHash;
        } catch (_err) {
          return false;
        }
      },
      'not duplicate claim': (r) => r.status !== 409,
      'not rate limited': (r) => r.status !== 429,
    });
  }

  // Brief pause to simulate user reviewing claim confirmation
  sleep(0.1 + Math.random() * 0.2);
}

// Rotate through a few campaign slugs to simulate claims across multiple campaigns
function selectCampaign() {
  const campaigns = ['summer-bonus', 'refer-friend', 'early-adopter', 'milestone-reward'];
  return campaigns[Math.floor(Math.random() * campaigns.length)];
}
