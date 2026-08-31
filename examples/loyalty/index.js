#!/usr/bin/env node
/**
 * Trivela Loyalty Program Example
 *
 * Creates a loyalty campaign, registers a participant, simulates
 * point accumulation, then claims the XLM reward.
 */

import * as dotenv from 'dotenv';
import { Keypair } from '@stellar/stellar-sdk';

dotenv.config();

const API = process.env.TRIVELA_API_URL ?? 'http://localhost:3001';
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;

if (!ADMIN_KEY) {
  console.error('Set ADMIN_SECRET_KEY in .env');
  process.exit(1);
}

const adminKeypair = Keypair.fromSecret(ADMIN_KEY);
const participantKeypair = Keypair.random();

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
  console.log('=== Trivela Loyalty Example ===\n');

  // 1. Create campaign
  console.log('1. Creating loyalty campaign…');
  const campaign = await post('/api/campaigns', {
    name: 'Loyalty Rewards Q3',
    description: 'Earn XLM for every interaction. Top participants claim bonus rewards.',
    reward_xlm: 10,
    max_participants: 100,
    admin_public_key: adminKeypair.publicKey(),
  });
  console.log(`   Campaign created: ${campaign.id}\n`);

  // 2. Register participant
  console.log('2. Registering participant…');
  await post(`/api/campaigns/${campaign.id}/register`, {
    wallet_address: participantKeypair.publicKey(),
  });
  console.log(`   Participant: ${participantKeypair.publicKey()}\n`);

  // 3. Simulate interactions (3 interactions = threshold met)
  console.log('3. Simulating participant interactions…');
  for (let i = 1; i <= 3; i++) {
    await post(`/api/campaigns/${campaign.id}/interact`, {
      wallet_address: participantKeypair.publicKey(),
      action: 'purchase',
      value: i * 5,
    });
    console.log(`   Interaction ${i} recorded`);
  }
  console.log();

  // 4. Claim reward
  console.log('4. Claiming reward…');
  const claim = await post(`/api/campaigns/${campaign.id}/claim`, {
    wallet_address: participantKeypair.publicKey(),
  });
  console.log(`   Claimed! TX: ${claim.transaction_hash ?? '(testnet)'}\n`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
