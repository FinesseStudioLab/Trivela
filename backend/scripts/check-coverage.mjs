#!/usr/bin/env node
// Backend coverage gate (#1320).
//
// Runs the backend test suite with Node's built-in coverage, writes an lcov report to
// backend/coverage/lcov.info, prints a summary and fails when line, branch or function coverage
// falls below the floors in backend/coverage-thresholds.json.
//
// Why a script instead of `--test-coverage-lines=N`: the gate must judge *coverage*, independent
// of whether every test passes (test failures are reported by the regular test steps), and it
// reports all three metrics at once. Needs Node >= 22 (lcov test reporter).
//
//   npm run test:coverage --workspace=backend            # run tests + gate
//   node scripts/check-coverage.mjs --from-lcov coverage/lcov.info   # gate an existing report
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lcovPath = join(root, 'coverage', 'lcov.info');
const thresholds = JSON.parse(readFileSync(join(root, 'coverage-thresholds.json'), 'utf8'));

/** Sum the LF/LH, BRF/BRH and FNF/FNH totals of an lcov report. */
export function summariseLcov(text) {
  const totals = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  const keys = {
    LF: ['lines', 0],
    LH: ['lines', 1],
    BRF: ['branches', 0],
    BRH: ['branches', 1],
    FNF: ['functions', 0],
    FNH: ['functions', 1],
  };
  for (const line of text.split('\n')) {
    const [tag, value] = line.split(':');
    const target = keys[tag];
    if (target) totals[target[0]][target[1]] += Number(value) || 0;
  }
  const pct = ([found, hit]) => (found === 0 ? 100 : (hit / found) * 100);
  return {
    lines: pct(totals.lines),
    branches: pct(totals.branches),
    functions: pct(totals.functions),
  };
}

function findTests(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'coverage') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTests(full, out);
    else if (entry.endsWith('.test.js')) out.push(relative(root, full));
  }
  return out;
}

function runTests() {
  mkdirSync(dirname(lcovPath), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--experimental-test-coverage',
      '--test-coverage-exclude=**/*.test.js',
      '--test-coverage-exclude=**/node_modules/**',
      '--test-timeout=20000',
      '--test-concurrency=8',
      '--test-reporter=lcov',
      `--test-reporter-destination=${lcovPath}`,
      '--test-reporter=dot',
      '--test-reporter-destination=stdout',
      ...findTests(join(root, 'src')),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  // A non-zero exit here only means some tests failed; those are enforced by the test steps.
}

const fromIndex = process.argv.indexOf('--from-lcov');
const source = fromIndex > -1 ? resolve(process.argv[fromIndex + 1]) : lcovPath;
if (fromIndex === -1) runTests();

if (!existsSync(source)) {
  console.error(`No lcov report at ${source}; the test run produced no coverage data.`);
  process.exit(2);
}

const actual = summariseLcov(readFileSync(source, 'utf8'));
let failed = false;
console.log('\nBackend coverage');
for (const metric of ['lines', 'branches', 'functions']) {
  const floor = thresholds[metric];
  const ok = actual[metric] >= floor;
  failed ||= !ok;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${metric.padEnd(9)} ${actual[metric].toFixed(2)}%  (minimum ${floor}%, target ${thresholds.target}%)`,
  );
}
if (failed) {
  console.error(
    '\nCoverage is below the floor. Add tests for the code you changed; do not lower coverage-thresholds.json.',
  );
  process.exit(1);
}
console.log('\nFloors are ratchets: when coverage rises, raise them in coverage-thresholds.json.');
