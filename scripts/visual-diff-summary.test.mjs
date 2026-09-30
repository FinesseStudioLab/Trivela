// Run: node --test scripts/visual-diff-summary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDiffs, renderSummary } from './visual-diff-summary.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'vds-'));
  for (const f of files) {
    const p = join(dir, f);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, 'x');
  }
  return dir;
}

test('missing directory yields no diffs', () => {
  assert.deepEqual(collectDiffs('/nonexistent-dir-1363'), []);
});

test('groups images per snapshot and ignores non-diff groups', () => {
  const dir = fixture([
    'a/home-expected.png',
    'a/home-actual.png',
    'a/home-diff.png',
    'b/other-actual.png',
    'b/trace.zip',
  ]);
  const diffs = collectDiffs(dir);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].name, 'a/home');
  assert.equal(diffs[0].diff, 'a/home-diff.png');
});

test('renders clean summary when there are no diffs', () => {
  assert.match(renderSummary([]), /No visual differences/);
});

test('renders table with artifact link and escapes pipes', () => {
  const md = renderSummary([{ name: 'a|b', diff: 'x/a-diff.png', actual: 'x/a-actual.png' }], {
    runUrl: 'https://example.com/run',
  });
  assert.match(md, /\*\*1\*\* screenshot/);
  assert.match(md, /\[visual-regression-diffs\]\(https:\/\/example.com\/run\)/);
  assert.match(md, /a\\\|b/);
  assert.match(md, /\| — \|/);
});
