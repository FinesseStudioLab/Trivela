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
execSync('cargo build --target wasm32-unknown-unknown --release -p trivela-rewards-contract -p trivela-campaign-contract', { stdio: 'inherit' });

console.log('Generating rewards bindings...');
execSync(`stellar contract bindings typescript --wasm ${rewardsWasm} --output-dir ${tempRewardsDir} --overwrite`, { stdio: 'inherit' });

console.log('Generating campaign bindings...');
execSync(`stellar contract bindings typescript --wasm ${campaignWasm} --output-dir ${tempCampaignDir} --overwrite`, { stdio: 'inherit' });

const packageImports = new Map(); // pkg -> Set of specifiers

function processImports(content) {
  // Regex to match imports spanning multiple lines
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g;
  let cleanContent = content;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importSpec = match[1].trim();
    const pkg = match[2].trim();
    
    if (pkg.startsWith('.')) {
      // Relative import - skip
      continue;
    }
    
    if (!packageImports.has(pkg)) {
      packageImports.set(pkg, new Set());
    }
    
    // Parse the imported items
    if (importSpec.startsWith('{') && importSpec.endsWith('}')) {
      const items = importSpec.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        packageImports.get(pkg).add(item);
      }
    } else {
      // Namespace or default import
      packageImports.get(pkg).add(importSpec);
    }
  }
  
  // Remove all import statements
  cleanContent = cleanContent.replace(importRegex, '');
  
  // Remove relative re-exports (e.g. export * from './types')
  const exportRegex = /export\s+\*\s+from\s+['"]([^'"]+)['"];?/g;
  cleanContent = cleanContent.replace(exportRegex, '');
  
  return cleanContent;
}

function formatImports() {
  let result = '';
  for (const [pkg, specifiers] of packageImports.entries()) {
    const named = [];
    const others = [];
    for (const spec of specifiers) {
      if (spec.startsWith('* as ') || (!spec.startsWith('{') && !spec.includes(','))) {
        others.push(spec);
      } else {
        named.push(spec);
      }
    }
    
    for (const other of others) {
      result += `import ${other} from '${pkg}';\n`;
    }
    if (named.length > 0) {
      const uniqueNamed = Array.from(new Set(named)).sort();
      result += `import { ${uniqueNamed.join(', ')} } from '${pkg}';\n`;
    }
  }
  return result;
}

function mergeBindings(tempDir, outFile) {
  const srcDir = path.join(tempDir, 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Src directory not found: ${srcDir}`);
  }
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));
  let combinedContent = '';
  for (const file of files) {
    if (file === 'index.ts') continue;
    const filePath = path.join(srcDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    content = processImports(content);
    combinedContent += `\n// --- Combined from ${file} ---\n` + content;
  }
  return combinedContent;
}

console.log('Merging rewards bindings into a single file...');
packageImports.clear();
const rewardsContent = mergeBindings(tempRewardsDir);
const rewardsImports = formatImports();
fs.writeFileSync('frontend/src/contracts/rewards.ts', rewardsImports + rewardsContent, 'utf8');

console.log('Merging campaign bindings into a single file...');
packageImports.clear();
const campaignContent = mergeBindings(tempCampaignDir);
const campaignImports = formatImports();
fs.writeFileSync('frontend/src/contracts/campaign.ts', campaignImports + campaignContent, 'utf8');

console.log('Cleaning up temporary directories...');
fs.rmSync(tempRewardsDir, { recursive: true, force: true });
fs.rmSync(tempCampaignDir, { recursive: true, force: true });

console.log('TypeScript bindings successfully generated and merged!');
