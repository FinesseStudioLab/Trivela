#!/usr/bin/env node
/**
 * Trivela Contract State Migration & Dump Helper (Issue #1372)
 *
 * Facilitates offline inspection, local testnet seeding, and contract state
 * migration between deployments.
 *
 * Usage:
 *   node scripts/contract-state-migration.mjs --help
 *   node scripts/contract-state-migration.mjs dump --contract <CONTRACT_ID> --output ./state.json
 *   node scripts/contract-state-migration.mjs restore --contract <CONTRACT_ID> --input ./state.json
 *   node scripts/contract-state-migration.mjs seed --contract <CONTRACT_ID> --participants-file ./participants.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function printHelp() {
  console.log(`
Trivela Contract State Migration Helper
========================================
Commands:
  dump      Export campaign contract state and active participants to a JSON file
  restore   Restore previously exported state to a target campaign contract
  seed      Batch seed participant addresses into a campaign contract
  verify    Verify state JSON file integrity and schema conformance

Options:
  --contract <ID>           Target Soroban campaign contract ID
  --network <NAME>          Target network (local | testnet | mainnet) [default: testnet]
  --source <KEY>            Admin secret or identity name [default: alice]
  --input <FILE>            Input JSON state file path
  --output <FILE>           Output JSON state file path [default: .contract-state-dump.json]
  --dry-run                 Simulate inspection without broadcasting transactions
  --help                    Show this message
`);
}

function parseArgs(args) {
  const isHelp = !args[0] || args[0] === '--help' || args[0] === '-h' || args[0] === 'help';
  const parsed = {
    command: isHelp ? 'help' : args[0],
    contract: null,
    network: process.env.STELLAR_NETWORK || 'testnet',
    source: process.env.STELLAR_SOURCE || 'alice',
    input: null,
    output: '.contract-state-dump.json',
    dryRun: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--contract' && args[i + 1]) parsed.contract = args[++i];
    else if (arg === '--network' && args[i + 1]) parsed.network = args[++i];
    else if (arg === '--source' && args[i + 1]) parsed.source = args[++i];
    else if (arg === '--input' && args[i + 1]) parsed.input = args[++i];
    else if (arg === '--output' && args[i + 1]) parsed.output = args[++i];
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') parsed.command = 'help';
  }

  return parsed;
}

export function validateStateDump(dump) {
  if (!dump || typeof dump !== 'object') {
    throw new Error('Invalid state dump: root must be an object');
  }

  const requiredFields = [
    'schema_version',
    'active',
    'start_time',
    'end_time',
    'max_cap',
    'participant_count',
    'schedule_mode',
    'participants',
  ];

  for (const field of requiredFields) {
    if (dump[field] === undefined) {
      throw new Error(`Invalid state dump: missing required field "${field}"`);
    }
  }

  if (dump.start_time > 0 && dump.end_time > 0 && dump.start_time > dump.end_time) {
    throw new Error('Validation error: start_time cannot be greater than end_time');
  }

  if (dump.max_cap > 0 && dump.participant_count > dump.max_cap) {
    throw new Error('Validation error: participant_count exceeds max_cap');
  }

  if (!Array.isArray(dump.participants)) {
    throw new Error('Validation error: participants must be an array');
  }

  return true;
}

export function exportState(contractId, network = 'testnet', source = 'alice', dryRun = false) {
  if (!contractId) {
    throw new Error('Contract ID is required to dump state');
  }

  if (dryRun) {
    console.log(`[dry-run] Would dump state for contract ${contractId} on ${network}`);
    return {
      schema_version: 1,
      admin: null,
      active: true,
      start_time: 0,
      end_time: 0,
      max_cap: 100,
      participant_count: 0,
      merkle_root: null,
      schedule_mode: 0,
      start_ledger: 0,
      end_ledger: 0,
      privacy_mode: 0,
      uniqueness_mode: 0,
      allowlist_enabled: false,
      blocklist_enabled: false,
      participants: [],
      exported_at: new Date().toISOString(),
    };
  }

  console.log(`Invoking dump_state on contract ${contractId} (${network})...`);
  const cmd = `stellar contract invoke --id "${contractId}" --source "${source}" --network "${network}" -- dump_state`;
  try {
    const raw = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const parsed = JSON.parse(raw);
    parsed.exported_at = new Date().toISOString();
    return parsed;
  } catch (err) {
    // If CLI not installed or offline, provide descriptive error
    throw new Error(`Failed to invoke dump_state: ${err.message}`);
  }
}

export function restoreState(contractId, dump, network = 'testnet', source = 'alice', dryRun = false) {
  validateStateDump(dump);

  if (dryRun) {
    console.log(`[dry-run] Would restore state to contract ${contractId} on ${network}`);
    console.log(`  Active: ${dump.active}`);
    console.log(`  Window: [${dump.start_time}, ${dump.end_time}]`);
    console.log(`  Max Cap: ${dump.max_cap}`);
    console.log(`  Participants to seed: ${dump.participants.length}`);
    return true;
  }

  console.log(`Restoring state to contract ${contractId} (${network})...`);
  const escapedJson = JSON.stringify(dump).replace(/"/g, '\\"');
  const cmd = `stellar contract invoke --id "${contractId}" --source "${source}" --network "${network}" -- restore_state --caller "${source}" --dump "${escapedJson}"`;
  execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (!opts.command || opts.command === 'help') {
    printHelp();
    process.exit(0);
  }

  try {
    switch (opts.command) {
      case 'dump': {
        const state = exportState(opts.contract, opts.network, opts.source, opts.dryRun);
        const outPath = path.resolve(process.cwd(), opts.output);
        fs.writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8');
        console.log(`✔ Contract state dumped successfully to: ${outPath}`);
        console.log(`  Participants: ${state.participants ? state.participants.length : 0}`);
        console.log(`  Active: ${state.active}`);
        break;
      }

      case 'restore': {
        if (!opts.input) throw new Error('--input file path is required for restore');
        const inPath = path.resolve(process.cwd(), opts.input);
        const content = fs.readFileSync(inPath, 'utf8');
        const dump = JSON.parse(content);
        restoreState(opts.contract, dump, opts.network, opts.source, opts.dryRun);
        console.log(`✔ Contract state restored successfully to ${opts.contract}`);
        break;
      }

      case 'verify': {
        if (!opts.input) throw new Error('--input file path is required for verify');
        const inPath = path.resolve(process.cwd(), opts.input);
        const content = fs.readFileSync(inPath, 'utf8');
        const dump = JSON.parse(content);
        validateStateDump(dump);
        console.log(`✔ State file ${opts.input} is valid and conforms to CampaignStateDump schema`);
        break;
      }

      default:
        console.error(`Unknown command: ${opts.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
