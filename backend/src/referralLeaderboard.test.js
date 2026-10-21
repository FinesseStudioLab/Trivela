import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './index.js';

async function startTestServer(options = {}) {
  const app = await createApp({
    dbPath: ':memory:',
    rateLimit: { windowMs: 60_000, maxRequests: 1000 },
    ...options,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function getSeedCampaignId(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/campaigns`);
  const payload = await response.json();
  return payload.data[0].id;
}

async function postReferral(baseUrl, campaignId, referrerAddress, refereeAddress) {
  return fetch(`${baseUrl}/api/v1/campaigns/${campaignId}/referrals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referrerAddress, refereeAddress }),
  });
}

test('GET /campaigns/:id/referrals/leaderboard ranks referrers by referral count, ties sharing a rank', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const campaignId = await getSeedCampaignId(baseUrl);

    // A: 2 referrals, B: 2 referrals (tied for #1), C: 1 referral (#3, rank skips to 3)
    await postReferral(baseUrl, campaignId, 'A', 'ref-a1');
    await postReferral(baseUrl, campaignId, 'A', 'ref-a2');
    await postReferral(baseUrl, campaignId, 'B', 'ref-b1');
    await postReferral(baseUrl, campaignId, 'B', 'ref-b2');
    await postReferral(baseUrl, campaignId, 'C', 'ref-c1');

    const response = await fetch(`${baseUrl}/api/v1/campaigns/${campaignId}/referrals/leaderboard`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.data.length, 3);
    assert.equal(payload.pagination.total, 3);

    const byWallet = Object.fromEntries(payload.data.map((row) => [row.walletAddress, row]));
    assert.equal(byWallet.A.rank, 1);
    assert.equal(byWallet.B.rank, 1);
    assert.equal(byWallet.C.rank, 3);

    assert.equal(byWallet.A.referralCount, 2);
    assert.equal(byWallet.C.referralCount, 1);

    // Tier progress present on every row.
    for (const row of payload.data) {
      assert.ok(row.tier);
      assert.equal(typeof row.tierProgressPercent, 'number');
    }
  } finally {
    await stopTestServer(server);
  }
});

test('GET /campaigns/:id/referrals/leaderboard/rank returns a referrer rank and tier progress', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const campaignId = await getSeedCampaignId(baseUrl);

    for (let i = 0; i < 10; i += 1) {
      await postReferral(baseUrl, campaignId, 'top-referrer', `referee-${i}`);
    }
    await postReferral(baseUrl, campaignId, 'small-referrer', 'referee-small');

    const topResponse = await fetch(
      `${baseUrl}/api/v1/campaigns/${campaignId}/referrals/leaderboard/rank?wallet=top-referrer`,
    );
    const topPayload = await topResponse.json();
    assert.equal(topPayload.rank, 1);
    assert.equal(topPayload.referralCount, 10);
    assert.equal(topPayload.tier.id, 'silver');
    assert.equal(topPayload.nextTier.id, 'gold');
    assert.equal(topPayload.referralsToNextTier, 15);

    const smallResponse = await fetch(
      `${baseUrl}/api/v1/campaigns/${campaignId}/referrals/leaderboard/rank?wallet=small-referrer`,
    );
    const smallPayload = await smallResponse.json();
    assert.equal(smallPayload.rank, 2);
    assert.equal(smallPayload.tier.id, 'bronze');

    const unknownResponse = await fetch(
      `${baseUrl}/api/v1/campaigns/${campaignId}/referrals/leaderboard/rank?wallet=never-referred`,
    );
    const unknownPayload = await unknownResponse.json();
    assert.equal(unknownPayload.rank, null);
    assert.equal(unknownPayload.referralCount, 0);
    assert.equal(unknownPayload.tier.id, 'bronze');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /campaigns/:id/referrals/leaderboard returns 404 for a missing campaign', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/999999/referrals/leaderboard`);
    assert.equal(response.status, 404);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /campaigns/:id/referrals/leaderboard/rank requires a wallet query param', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const campaignId = await getSeedCampaignId(baseUrl);
    const response = await fetch(
      `${baseUrl}/api/v1/campaigns/${campaignId}/referrals/leaderboard/rank`,
    );
    assert.equal(response.status, 400);
  } finally {
    await stopTestServer(server);
  }
});
