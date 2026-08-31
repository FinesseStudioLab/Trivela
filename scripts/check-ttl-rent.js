#!/usr/bin/env node
// check-ttl-rent.js — Alert when Soroban storage entries approach TTL expiry.
// Issue #799: Contract storage rent / TTL budgeting model and alerts.
//
// Usage:
//   node scripts/check-ttl-rent.js --network testnet --contract <CONTRACT_ID>
//
// Environment variables:
//   SOROBAN_RPC_URL         Override RPC endpoint (optional)
//   RENT_ALERT_THRESHOLD    Ledgers below which an entry is flagged (default: 10000)
//   LEDGER_CLOSE_SECONDS    Approximate ledger close time in seconds (default: 5)

'use strict';

const { execSync } = require('child_process');

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const network = getArg('--network') || 'testnet';
const contractId = getArg('--contract');
const ALERT_THRESHOLD = parseInt(process.env.RENT_ALERT_THRESHOLD || '10000', 10);
const LEDGER_CLOSE_S = parseInt(process.env.LEDGER_CLOSE_SECONDS || '5', 10);

const RPC_URLS = {
  mainnet: 'https://mainnet.stellar.validationcloud.io/v1/soroban',
  testnet: 'https://soroban-testnet.stellar.org',
};
const rpcUrl = process.env.SOROBAN_RPC_URL || RPC_URLS[network] || RPC_URLS.testnet;

if (!contractId) {
  console.error('Usage: node scripts/check-ttl-rent.js --network <net> --contract <ID>');
  process.exit(1);
}

// ── TTL cost model ────────────────────────────────────────────────────────────

const RENT_FEE_DENOMINATOR = 3_543_200; // mainnet constant
const ENTRY_SIZE_BYTES = 256;           // conservative estimate for a participant entry

function estimateRentXlm(ledgers) {
  const stroops = (ENTRY_SIZE_BYTES * ledgers) / RENT_FEE_DENOMINATOR;
  return (stroops / 1e7).toFixed(8);
}

function ledgersToHuman(ledgers) {
  const seconds = ledgers * LEDGER_CLOSE_S;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

// ── Fetch storage_stats from contract ────────────────────────────────────────

function callContractView(fn, args = '') {
  try {
    const cmd = [
      'stellar contract invoke',
      `--id ${contractId}`,
      `--rpc-url ${rpcUrl}`,
      `--network-passphrase "Test SDF Network ; September 2015"`,
      '--',
      `--fn ${fn}`,
      args,
    ].filter(Boolean).join(' ');
    const output = execSync(cmd, { encoding: 'utf8', timeout: 15_000 });
    return JSON.parse(output.trim());
  } catch (err) {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTrivela TTL Rent Check — network: ${network}, contract: ${contractId}`);
  console.log(`Alert threshold: ${ALERT_THRESHOLD} ledgers (≈ ${ledgersToHuman(ALERT_THRESHOLD)})\n`);

  // Try to get storage stats from the contract (may not be available on all versions).
  const stats = callContractView('storage_stats');

  if (!stats) {
    console.warn('WARN  Could not retrieve storage_stats — falling back to estimation only.\n');
    console.log('Estimated annual rent (256-byte entry, 30-day extension):');
    const annualLedgers = Math.round((365 * 24 * 3600) / LEDGER_CLOSE_S);
    for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
      const xlm = (parseFloat(estimateRentXlm(518_400)) * n * 3).toFixed(4);
      console.log(`  ${n.toLocaleString().padStart(9)} participants → ~${xlm} XLM/year`);
    }
    console.log('\nSee docs/TTL_RENT_MODEL.md for the full budget model.');
    process.exit(0);
  }

  const participantCount = stats.participant_count ?? 0;
  const noncesActive = stats.nonces_active ?? 0;
  console.log(`Contract stats: ${participantCount} participants, ${noncesActive} active nonces`);

  // Inspect the entries list if returned.
  const entries = stats.entries ?? [];
  let alertCount = 0;

  for (const entry of entries) {
    const { key, ttl_ledgers } = entry;
    const tag = ttl_ledgers < ALERT_THRESHOLD ? 'ALERT' : 'OK   ';
    const timeLeft = ledgersToHuman(ttl_ledgers);
    const extendCostXlm = estimateRentXlm(518_400 - ttl_ledgers);
    if (ttl_ledgers < ALERT_THRESHOLD) {
      alertCount++;
      console.log(`${tag}  ${key} — TTL ${ttl_ledgers} ledgers (≈${timeLeft}) — EXPIRING SOON [extend cost ≈ ${extendCostXlm} XLM]`);
    } else {
      console.log(`${tag}  ${key} — TTL ${ttl_ledgers} ledgers (≈${timeLeft})`);
    }
  }

  console.log(`\nSummary: ${alertCount} entries below threshold (${ALERT_THRESHOLD} ledgers / ≈${ledgersToHuman(ALERT_THRESHOLD)})`);

  if (alertCount > 0) {
    console.error('\nACTION REQUIRED: Submit extend_ttl transactions for flagged entries.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('check-ttl-rent.js failed:', err.message);
  process.exit(1);
});
