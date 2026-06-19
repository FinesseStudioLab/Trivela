import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Ensure output directory exists
fs.mkdirSync('frontend/src/contracts', { recursive: true });

try {
  execSync('stellar --version', { stdio: 'ignore' });
} catch (e) {
  console.error('Error: stellar CLI is not installed or not in PATH.');
  process.exit(1);
}

const rewardsWasm = 'target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm';
const campaignWasm = 'target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm';

const tempRewardsDir = 'frontend/src/contracts/temp_rewards';
const tempCampaignDir = 'frontend/src/contracts/temp_campaign';

console.log('Building contracts WASM...');
execSync(
  'cargo build --target wasm32-unknown-unknown --release -p trivela-rewards-contract -p trivela-campaign-contract',
  { stdio: 'inherit' },
);

console.log('Generating rewards bindings...');
execSync(
  `stellar contract bindings typescript --wasm ${rewardsWasm} --output-dir ${tempRewardsDir} --overwrite`,
  { stdio: 'inherit' },
);

console.log('Generating campaign bindings...');
execSync(
  `stellar contract bindings typescript --wasm ${campaignWasm} --output-dir ${tempCampaignDir} --overwrite`,
  { stdio: 'inherit' },
);

function readGeneratedBindings(tempDir) {
  // Modern `stellar contract bindings typescript` consolidates everything
  // (types, errors, Client class) into a single self-contained src/index.ts,
  // so no merging across files is needed — just take it as-is.
  const indexFile = path.join(tempDir, 'src', 'index.ts');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`Generated bindings entry point not found: ${indexFile}`);
  }
  return fs.readFileSync(indexFile, 'utf8');
}

console.log('Copying rewards bindings...');
fs.writeFileSync(
  'frontend/src/contracts/rewards.ts',
  readGeneratedBindings(tempRewardsDir),
  'utf8',
);

console.log('Copying campaign bindings...');
fs.writeFileSync(
  'frontend/src/contracts/campaign.ts',
  readGeneratedBindings(tempCampaignDir),
  'utf8',
);

console.log('Cleaning up temporary directories...');
fs.rmSync(tempRewardsDir, { recursive: true, force: true });
fs.rmSync(tempCampaignDir, { recursive: true, force: true });

console.log('Formatting generated bindings...');
execSync(
  'npx prettier --write frontend/src/contracts/rewards.ts frontend/src/contracts/campaign.ts',
  { stdio: 'inherit' },
);

console.log('TypeScript bindings successfully generated and merged!');
