#!/usr/bin/env node
/**
 * Trivela Airdrop Example
 *
 * Reads a list of wallet addresses from a CSV file and airdrops
 * XLM rewards to all eligible participants in a single campaign.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { Keypair } from '@stellar/stellar-sdk';

dotenv.config();

const API = process.env.TRIVELA_API_URL ?? 'http://localhost:3001';
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;
const REWARD_XLM = Number(process.env.REWARD_XLM ?? '5');

if (!ADMIN_KEY) {
  console.error('Set ADMIN_SECRET_KEY in .env');
  process.exit(1);
}

const csvFile = process.argv[2];
if (!csvFile) {
  console.error('Usage: node index.js wallets.csv');
  process.exit(1);
}

const adminKeypair = Keypair.fromSecret(ADMIN_KEY);

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
  console.log('=== Trivela Airdrop Example ===\n');

  // 1. Read wallets
  const wallets = fs
    .readFileSync(path.resolve(csvFile), 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('G'));
  console.log(`1. Loaded ${wallets.length} wallet(s) from ${csvFile}\n`);

  // 2. Create campaign
  console.log('2. Creating airdrop campaign…');
  const campaign = await post('/api/campaigns', {
    name: 'XLM Airdrop Wave 1',
    description: 'One-shot XLM airdrop to early adopters.',
    reward_xlm: REWARD_XLM,
    max_participants: wallets.length,
    admin_public_key: adminKeypair.publicKey(),
  });
  console.log(`   Campaign: ${campaign.id}\n`);

  // 3. Bulk register
  console.log('3. Registering participants…');
  await Promise.all(
    wallets.map((wallet) =>
      post(`/api/campaigns/${campaign.id}/register`, { wallet_address: wallet }),
    ),
  );
  console.log(`   Registered ${wallets.length} wallet(s)\n`);

  // 4. Trigger airdrop
  console.log('4. Triggering airdrop…');
  const result = await post(`/api/campaigns/${campaign.id}/airdrop`, {
    admin_public_key: adminKeypair.publicKey(),
  });
  console.log(`   Airdrop complete. Distributed to ${result.count ?? wallets.length} wallets.\n`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
