#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const taxonomyPath = resolve(repoRoot, 'scripts', 'github-labels.json');

function runGh(args, options = {}) {
  const result = spawnSync('gh', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || 'gh command failed';
    throw new Error(message);
  }

  return result.stdout.trim();
}

function resolveRepository(explicitRepo) {
  if (explicitRepo) {
    return explicitRepo;
  }

  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  const output = runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  if (!output) {
    throw new Error('Unable to determine repository. Pass --repo owner/name.');
  }

  return output;
}

function parseArgs(argv) {
  const args = { repo: '' };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--repo') {
      args.repo = argv[i + 1] || '';
      i += 1;
    }
  }

  return args;
}

function loadLabels() {
  return JSON.parse(readFileSync(taxonomyPath, 'utf8'));
}

function syncLabel(repo, label) {
  const baseArgs = ['label', 'create', label.name, '--repo', repo, '--color', label.color];
  if (label.description) {
    baseArgs.push('--description', label.description);
  }

  const createResult = spawnSync('gh', baseArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (createResult.status === 0) {
    console.log(`created ${label.name}`);
    return;
  }

  const combinedOutput = `${createResult.stdout}\n${createResult.stderr}`.toLowerCase();
  if (combinedOutput.includes('already exists')) {
    const editArgs = ['label', 'edit', label.name, '--repo', repo, '--color', label.color];
    if (label.description) {
      editArgs.push('--description', label.description);
    }
    runGh(editArgs);
    console.log(`updated ${label.name}`);
    return;
  }

  throw new Error(`Failed to sync label "${label.name}": ${createResult.stderr.trim()}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = resolveRepository(args.repo);
  const labels = loadLabels();

  for (const label of labels) {
    syncLabel(repo, label);
  }
}

main();
