import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { diffSnapshots, parseInterval, snapshot } from './dev-watch.js';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'devwatch-'));
  mkdirSync(path.join(dir, 'node_modules'));
  writeFileSync(path.join(dir, 'a.js'), 'a');
  writeFileSync(path.join(dir, 'notes.md'), 'x');
  writeFileSync(path.join(dir, 'node_modules', 'dep.js'), 'x');
  return dir;
}

test('snapshot only tracks watched extensions and skips node_modules', () => {
  const dir = fixture();
  try {
    const files = [...snapshot(dir).keys()].map((f) => path.basename(f));
    assert.deepEqual(files, ['a.js']);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('snapshot of a missing directory is empty', () => {
  assert.equal(snapshot('/nonexistent-dir-xyz').size, 0);
});

test('diffSnapshots detects modified, added and removed files', () => {
  const dir = fixture();
  try {
    const before = snapshot(dir);
    assert.deepEqual(diffSnapshots(before, snapshot(dir)), []);

    utimesSync(path.join(dir, 'a.js'), new Date(), new Date(Date.now() + 5000));
    writeFileSync(path.join(dir, 'b.js'), 'b');
    const after = snapshot(dir);
    assert.deepEqual(
      diffSnapshots(before, after).map((f) => path.basename(f)),
      ['a.js', 'b.js'],
    );

    rmSync(path.join(dir, 'b.js'));
    assert.deepEqual(
      diffSnapshots(after, snapshot(dir)).map((f) => path.basename(f)),
      ['a.js', 'b.js'].slice(1),
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('parseInterval validates and clamps input', () => {
  assert.equal(parseInterval(undefined), 500);
  assert.equal(parseInterval('abc'), 500);
  assert.equal(parseInterval('-5'), 500);
  assert.equal(parseInterval('10'), 50);
  assert.equal(parseInterval('1000'), 1000);
});
