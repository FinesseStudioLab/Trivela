/**
 * Bundle-size budget gate.
 *
 * Reads every *.js file produced under frontend/dist/assets and fails if any
 * single chunk exceeds the per-chunk budget or if the total JS payload exceeds
 * the total budget.
 *
 * Budgets (uncompressed, before gzip):
 *   Per chunk : 600 KB   — prevents any single lazy route from bloating
 *   Total JS  : 2 000 KB — guards against total payload growth
 *
 * Usage (after `npm run build --workspace=frontend`):
 *   node scripts/check-bundle-size.mjs [--dist frontend/dist]
 */

import { readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const CHUNK_BUDGET_KB = 600;
const TOTAL_BUDGET_KB = 2000;

const args = process.argv.slice(2);
const distFlag = args.indexOf('--dist');
const distDir = distFlag !== -1 ? args[distFlag + 1] : 'frontend/dist';
const assetsDir = join(distDir, 'assets');

function collectJsFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => extname(f) === '.js')
      .map((f) => ({ name: f, path: join(dir, f), size: statSync(join(dir, f)).size }));
  } catch {
    console.error(`Could not read ${dir} — run 'npm run build --workspace=frontend' first.`);
    process.exit(1);
  }
}

const files = collectJsFiles(assetsDir);

if (files.length === 0) {
  console.error('No JS files found in', assetsDir);
  process.exit(1);
}

let failures = 0;
let totalBytes = 0;

console.log('\nBundle size report\n' + '─'.repeat(60));

for (const { name, size } of files) {
  const kb = size / 1024;
  totalBytes += size;
  const over = kb > CHUNK_BUDGET_KB;
  const marker = over ? '✗ OVER BUDGET' : '✓';
  console.log(`  ${marker.padEnd(14)} ${name.padEnd(40)} ${kb.toFixed(1)} KB`);
  if (over) failures++;
}

const totalKb = totalBytes / 1024;
const totalOver = totalKb > TOTAL_BUDGET_KB;

console.log('─'.repeat(60));
console.log(
  `  ${totalOver ? '✗ OVER BUDGET' : '✓'.padEnd(14)} Total JS${' '.repeat(32)} ${totalKb.toFixed(1)} KB`,
);
console.log();

if (totalOver) {
  console.error(
    `Total JS ${totalKb.toFixed(1)} KB exceeds the ${TOTAL_BUDGET_KB} KB budget.`,
  );
  failures++;
}

if (failures > 0) {
  console.error(
    `\n${failures} budget violation(s). Split heavy chunks or increase budgets intentionally.\n`,
  );
  process.exit(1);
}

console.log('All chunks within budget.\n');
