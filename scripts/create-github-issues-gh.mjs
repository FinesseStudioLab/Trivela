#!/usr/bin/env node
/**
 * Create GitHub issues using the GitHub CLI (gh), with throttling and resume support.
 *
 * Why: avoids PAT usage and supports safe batching with delays.
 *
 * Requirements:
 * - GitHub CLI installed: https://cli.github.com/
 * - Authenticated: `gh auth login`
 *
 * Usage:
 *   node scripts/create-github-issues-gh.mjs --file docs/issues-data.json --start 0 --end 49 --delay-ms 3000
 *   node scripts/create-github-issues-gh.mjs --file docs/issues-data.json --start 50 --end 99 --delay-ms 3000
 *
 * Flags:
 *   --file <path>         JSON array of { title, body, labels? }
 *   --repo <owner/name>   Optional repo override (defaults to current git remote)
 *   --start <n>           Start index (inclusive), default 0
 *   --end <n>             End index (inclusive), default last index
 *   --delay-ms <n>        Delay between creations, default 2500
 *   --create-labels       Create any missing labels referenced by issues
 *   --dry-run             Print what would be created, without calling gh
 */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function usage(exitCode = 1) {
  console.error(
    'Usage: node scripts/create-github-issues-gh.mjs --file <path> [--repo owner/name] [--start N] [--end N]',
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    file: '',
    repo: '',
    start: 0,
    end: null,
    delayMs: 2500,
    createLabels: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') args.file = argv[++i] || '';
    else if (arg === '--repo') args.repo = argv[++i] || '';
    else if (arg === '--start') args.start = Number.parseInt(argv[++i], 10);
    else if (arg === '--end') args.end = Number.parseInt(argv[++i], 10);
    else if (arg === '--delay-ms') args.delayMs = Number.parseInt(argv[++i], 10);
    else if (arg === '--create-labels') args.createLabels = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage(0);
    else {
      console.error('Unknown arg:', arg);
      usage(1);
    }
  }

  if (!args.file) {
    console.error('Missing --file');
    usage(1);
  }

  if (!Number.isFinite(args.start) || args.start < 0) {
    console.error('--start must be a non-negative integer');
    usage(1);
  }

  if (args.end !== null && (!Number.isFinite(args.end) || args.end < args.start)) {
    console.error('--end must be >= --start');
    usage(1);
  }

  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    console.error('--delay-ms must be a non-negative integer');
    usage(1);
  }

  return args;
}

function runGh(args, { input } = {}) {
  const result = spawnSync('gh', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    input: input ?? null,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || '').trim() || `gh exited with ${result.status}`,
    );
  }

  return (result.stdout || '').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadIssues(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const issues = JSON.parse(raw);
  if (!Array.isArray(issues)) {
    throw new Error('Issues file must be a JSON array');
  }
  return issues.map((issue, index) => {
    if (!issue || typeof issue !== 'object') {
      throw new Error(`Issue at index ${index} must be an object`);
    }
    if (typeof issue.title !== 'string' || issue.title.trim().length === 0) {
      throw new Error(`Issue at index ${index} is missing a non-empty "title"`);
    }
    if (typeof issue.body !== 'string') {
      throw new Error(`Issue at index ${index} is missing a string "body"`);
    }
    const labels = Array.isArray(issue.labels) ? issue.labels.map(String) : [];
    return { title: issue.title.trim(), body: issue.body, labels };
  });
}

function inferRepoFromGit() {
  const res = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  const url = (res.stdout || '').trim();
  const match = url.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i);
  if (!match) {
    return '';
  }
  return `${match[1]}/${match[2]}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo || inferRepoFromGit();
  if (!repo) {
    console.error('Unable to infer repo. Provide --repo owner/name.');
    process.exit(1);
  }

  const issues = loadIssues(args.file);
  const start = args.start;
  const end = args.end ?? issues.length - 1;
  if (start > end || end >= issues.length) {
    throw new Error(
      `Range out of bounds. File has ${issues.length} issues; got start=${start} end=${end}`,
    );
  }

  if (!args.dryRun) {
    runGh(['auth', 'status']);
  }

  const existingTitles = new Set();
  if (!args.dryRun) {
    const raw = runGh(['issue', 'list', '--repo', repo, '--limit', '1000', '--json', 'title']);
    const parsed = raw ? JSON.parse(raw) : [];
    for (const issue of parsed) {
      if (issue?.title) existingTitles.add(String(issue.title));
    }
  }

  if (args.createLabels && !args.dryRun) {
    const raw = runGh(['label', 'list', '--repo', repo, '--limit', '1000', '--json', 'name']);
    const parsed = raw ? JSON.parse(raw) : [];
    const existing = new Set(parsed.map((l) => l?.name).filter(Boolean));
    const wanted = new Set();
    for (let i = start; i <= end; i += 1) {
      for (const label of issues[i].labels) wanted.add(label);
    }
    for (const label of wanted) {
      if (!existing.has(label)) {
        console.log('Creating missing label:', label);
        runGh(['label', 'create', label, '--repo', repo]);
      }
    }
  }

  let created = 0;
  let skipped = 0;

  for (let i = start; i <= end; i += 1) {
    const issue = issues[i];
    const labelsArg = issue.labels.length ? ['--label', issue.labels.join(',')] : [];

    if (existingTitles.has(issue.title)) {
      skipped += 1;
      console.log(`[${i}] SKIP (exists): ${issue.title}`);
      continue;
    }

    if (args.dryRun) {
      console.log(`[${i}] DRY-RUN: ${issue.title} (${issue.labels.join(', ') || 'no labels'})`);
      continue;
    }

    runGh([
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      issue.title,
      '--body',
      issue.body,
      ...labelsArg,
    ]);
    existingTitles.add(issue.title);
    created += 1;
    console.log(`[${i}] CREATED: ${issue.title}`);

    if (i < end && args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  console.log(`Done. Created=${created}, Skipped=${skipped}, Range=${start}-${end}, Repo=${repo}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
