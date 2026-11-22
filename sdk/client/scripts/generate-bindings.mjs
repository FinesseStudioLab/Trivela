#!/usr/bin/env node
/**
 * Generate TypeScript bindings from Soroban contract WASM files.
 *
 * This script uses `stellar contract bindings typescript` to generate
 * TypeScript client code from compiled Soroban smart contracts.
 *
 * Issue #878: TypeScript SDK with contract bindings
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SDK_ROOT = join(__dirname, '..');
const CONTRACTS_ROOT = join(SDK_ROOT, '..', '..', 'contracts');
const OUTPUT_DIR = join(SDK_ROOT, 'contracts');

// Contract configurations
const CONTRACTS = [
  {
    name: 'rewards',
    wasmPath: join(
      CONTRACTS_ROOT,
      'rewards',
      'target',
      'wasm32-unknown-unknown',
      'release',
      'rewards_contract.wasm',
    ),
    outputFile: 'rewards.ts',
  },
  {
    name: 'campaign',
    wasmPath: join(
      CONTRACTS_ROOT,
      'campaign',
      'target',
      'wasm32-unknown-unknown',
      'release',
      'campaign_contract.wasm',
    ),
    outputFile: 'campaign.ts',
  },
];

console.log('🔧 Generating TypeScript contract bindings...\n');

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

let hasErrors = false;

for (const contract of CONTRACTS) {
  console.log(`📦 Processing ${contract.name} contract...`);

  if (!existsSync(contract.wasmPath)) {
    console.warn(`⚠️  WASM file not found: ${contract.wasmPath}`);
    console.warn(
      `   Skipping ${contract.name}. Build the contracts first with: cargo build --release --target wasm32-unknown-unknown\n`,
    );
    hasErrors = true;
    continue;
  }

  try {
    const outputPath = join(OUTPUT_DIR, contract.outputFile);

    // Generate bindings using stellar CLI
    // Note: This requires `stellar` CLI to be installed
    // Install with: cargo install --locked stellar-cli
    execSync(
      `stellar contract bindings typescript --wasm ${contract.wasmPath} --output-dir ${OUTPUT_DIR} --overwrite`,
      { stdio: 'inherit' },
    );

    console.log(`✅ Generated bindings for ${contract.name}\n`);
  } catch (error) {
    console.error(`❌ Failed to generate bindings for ${contract.name}:`, error.message);
    hasErrors = true;
  }
}

// Generate index file that exports all contracts
const indexContent = `/**
 * Trivela Smart Contract TypeScript Bindings
 * 
 * Auto-generated bindings for Soroban smart contracts.
 * 
 * Usage:
 * \`\`\`typescript
 * import { RewardsContract, CampaignContract } from '@trivela/client/contracts';
 * 
 * const rewards = new RewardsContract({ contractId: 'C...', rpcUrl: 'https://...' });
 * const balance = await rewards.balance({ user: 'G...' });
 * \`\`\`
 */

// Export contract clients
export * from './rewards';
export * from './campaign';
`;

writeFileSync(join(OUTPUT_DIR, 'index.ts'), indexContent);

console.log('📝 Generated contracts index file');

if (hasErrors) {
  console.log('\n⚠️  Some bindings could not be generated. Build the contracts first:\n');
  console.log('   cd contracts/rewards && cargo build --release --target wasm32-unknown-unknown');
  console.log(
    '   cd contracts/campaign && cargo build --release --target wasm32-unknown-unknown\n',
  );
  process.exit(0); // Don't fail - allow partial generation for development
}

console.log('\n✨ Contract bindings generation complete!\n');
