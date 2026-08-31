#!/usr/bin/env node
/**
 * Trivela DAO Rewards Example
 *
 * Creates a weighted reward pool for governance participants and
 * distributes XLM proportionally based on each voter's participation weight.
 */

import * as dotenv from 'dotenv';
import { Keypair } from '@stellar/stellar-sdk';

dotenv.config();

const API = process.env.TRIVELA_API_URL ?? 'http://localhost:3001';
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;
const TOTAL_POOL_XLM = Number(process.env.TOTAL_POOL_XLM ?? '100');

if (!ADMIN_KEY) {
  console.error('Set ADMIN_SECRET_KEY in .env');
  process.exit(1);
}

const adminKeypair = Keypair.fromSecret(ADMIN_KEY);

// Simulate 4 DAO voters with different participation weights (votes cast)
const voters = [
  { keypair: Keypair.random(), votes: 50 },
  { keypair: Keypair.random(), votes: 30 },
  { keypair: Keypair.random(), votes: 15 },
  { keypair: Keypair.random(), votes: 5 },
];

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('=== Trivela DAO Rewards Example ===\n');

  const totalVotes = voters.reduce((s, v) => s + v.votes, 0);

  // 1. Create DAO reward campaign
  console.log('1. Creating DAO reward pool…');
  const campaign = await post('/api/campaigns', {
    name: 'Governance Cycle 7 Rewards',
    description: 'XLM distributed proportionally to voters in governance cycle 7.',
    reward_xlm: TOTAL_POOL_XLM,
    max_participants: voters.length,
    admin_public_key: adminKeypair.publicKey(),
    distribution_mode: 'weighted',
  });
  console.log(`   Campaign: ${campaign.id} | Pool: ${TOTAL_POOL_XLM} XLM\n`);

  // 2. Register voters with weights
  console.log('2. Registering voters…');
  for (const voter of voters) {
    const share = ((voter.votes / totalVotes) * 100).toFixed(1);
    await post(`/api/campaigns/${campaign.id}/register`, {
      wallet_address: voter.keypair.publicKey(),
      weight: voter.votes,
    });
    console.log(
      `   ${voter.keypair.publicKey().slice(0, 8)}… — ${voter.votes} votes (${share}%)`,
    );
  }
  console.log();

  // 3. Distribute rewards
  console.log('3. Distributing proportional rewards…');
  const result = await post(`/api/campaigns/${campaign.id}/distribute`, {
    admin_public_key: adminKeypair.publicKey(),
  });
  console.log(`   Distribution complete. TX: ${result.transaction_hash ?? '(testnet)'}\n`);

  // Print expected payouts
  console.log('Expected payouts:');
  for (const voter of voters) {
    const payout = ((voter.votes / totalVotes) * TOTAL_POOL_XLM).toFixed(4);
    console.log(`   ${voter.keypair.publicKey().slice(0, 8)}… → ${payout} XLM`);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
