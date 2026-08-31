#!/usr/bin/env node
/**
 * Trivela Sandbox Seeder
 *
 * Provisions a local testnet playground:
 *   1. Generates (or loads) a funded admin keypair via Friendbot
 *   2. POSTs seeded demo campaigns to the local API
 *   3. Registers sample participant wallets
 *   4. Prints a reset summary so the sandbox can be torn down cleanly
 *
 * Usage:
 *   node scripts/sandbox-seed.js [--reset]
 *
 * Options:
 *   --reset   Delete all seeded campaigns before re-seeding
 *
 * Env vars (all optional — defaults target local dev stack):
 *   TRIVELA_API_URL     Default: http://localhost:3001
 *   STELLAR_NETWORK     Default: testnet
 *   FRIENDBOT_URL       Default: https://friendbot.stellar.org
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_STATE_FILE = path.resolve(__dirname, '../.sandbox-state.json');

const API = process.env.TRIVELA_API_URL ?? 'http://localhost:3001';
const FRIENDBOT = process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org';
const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------------------
// Demo campaigns to seed
// ---------------------------------------------------------------------------
const DEMO_CAMPAIGNS = [
  {
    name: '[DEMO] Loyalty Starter',
    description: 'Testnet loyalty campaign — earn XLM for each simulated interaction.',
    reward_xlm: 5,
    max_participants: 50,
  },
  {
    name: '[DEMO] Airdrop Wave',
    description: 'Testnet airdrop — claim your 2 XLM allocation.',
    reward_xlm: 2,
    max_participants: 200,
  },
  {
    name: '[DEMO] DAO Governance Q1',
    description: 'Testnet DAO reward pool — proportional XLM for governance voters.',
    reward_xlm: 100,
    max_participants: 20,
    distribution_mode: 'weighted',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function friendbot(publicKey) {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) throw new Error(`Friendbot failed for ${publicKey}: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${path} → ${res.status}`);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(SEED_STATE_FILE, 'utf-8'));
  } catch {
    return { admin: null, campaigns: [], participants: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(SEED_STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Trivela Sandbox Seeder ===\n');

  let state = loadState();

  // Reset: delete previously seeded campaigns
  if (RESET && state.campaigns.length > 0) {
    console.log(`Resetting ${state.campaigns.length} previously seeded campaign(s)…`);
    for (const id of state.campaigns) {
      await apiDelete(`/api/campaigns/${id}`);
    }
    state = { admin: null, campaigns: [], participants: [] };
    saveState(state);
    console.log('Reset complete.\n');
  }

  // 1. Admin keypair — reuse if already funded
  let adminKeypair;
  if (state.admin?.secret) {
    adminKeypair = Keypair.fromSecret(state.admin.secret);
    console.log(`1. Reusing admin keypair: ${adminKeypair.publicKey()}`);
  } else {
    adminKeypair = Keypair.random();
    console.log(`1. Generating admin keypair: ${adminKeypair.publicKey()}`);
    console.log('   Funding via Friendbot…');
    await friendbot(adminKeypair.publicKey());
    state.admin = { public: adminKeypair.publicKey(), secret: adminKeypair.secret() };
    saveState(state);
    console.log('   Funded.');
  }
  console.log();

  // 2. Create demo campaigns
  console.log('2. Creating demo campaigns…');
  for (const def of DEMO_CAMPAIGNS) {
    const campaign = await apiPost('/api/campaigns', {
      ...def,
      admin_public_key: adminKeypair.publicKey(),
    });
    state.campaigns.push(campaign.id);
    console.log(`   [${campaign.id}] ${def.name}`);
  }
  saveState(state);
  console.log();

  // 3. Register sample participants
  console.log('3. Registering sample participants…');
  const campaignId = state.campaigns[0];
  for (let i = 0; i < 5; i++) {
    const kp = Keypair.random();
    await apiPost(`/api/campaigns/${campaignId}/register`, {
      wallet_address: kp.publicKey(),
    });
    state.participants.push(kp.publicKey());
    console.log(`   ${kp.publicKey().slice(0, 12)}… registered to ${campaignId}`);
  }
  saveState(state);
  console.log();

  console.log('Sandbox ready!');
  console.log(`  API:       ${API}`);
  console.log(`  Admin key: ${adminKeypair.publicKey()}`);
  console.log(`  Campaigns: ${state.campaigns.join(', ')}`);
  console.log('\nRun with --reset to wipe and re-seed.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
