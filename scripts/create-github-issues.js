#!/usr/bin/env node
/**
 * Creates Trivela GitHub labels and 50 contributor issues using PAT from .env.local.
 *
 * Run from repo root (after pushing the repo at least once):
 *   node scripts/create-github-issues.js
 *
 * Requires: Node 18+, repo FinesseStudioLab/Trivela exists, PAT in .env.local with repo scope.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptRoot = resolve(__dirname, '..');
const root = process.cwd();
const DEBUG = process.env.DEBUG === '1';

const OWNER = 'FinesseStudioLab';
const REPO = 'Trivela';
const API = 'https://api.github.com';

// Labels we need (name, color, description)
const LABELS = [
  { name: 'area: backend', color: '1d76db', description: 'Backend API (Node/Express)' },
  { name: 'area: frontend', color: '1d76db', description: 'Frontend (React/Vite)' },
  { name: 'area: smart-contract', color: '1d76db', description: 'Soroban Rust contracts' },
  { name: 'area: documentation', color: '1d76db', description: 'Docs, README, comments' },
  { name: 'difficulty: easy', color: '0e8a16', description: 'Small scope' },
  { name: 'difficulty: medium', color: 'fbca04', description: 'Moderate complexity' },
  { name: 'difficulty: hard', color: 'd93f0b', description: 'Larger or subtle changes' },
  { name: 'good first issue', color: '7057ff', description: 'Good for first-time contributors' },
  { name: 'help wanted', color: '008672', description: 'Extra attention welcome' },
];

function loadPat() {
  // 1) Prefer env var so it works even if .env.local is ignored by the environment
  const fromEnv = process.env.PAT || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (fromEnv && fromEnv.trim().length > 10) {
    if (DEBUG) console.error('Using token from process.env');
    return fromEnv.trim();
  }

  const names = ['.env.local', '.env'];
  const roots = [root, scriptRoot];
  for (const r of roots) {
    for (const file of names) {
      const envPath = resolve(r, file);
      if (!existsSync(envPath)) {
        if (DEBUG) console.error('Skip (missing):', envPath);
        continue;
      }
      try {
        let raw = readFileSync(envPath, 'utf8');
        if (!raw || raw.length === 0) {
          if (DEBUG) console.error('Empty file:', envPath);
          continue;
        }
        raw = raw.replace(/^\uFEFF/, '').trim();
        const match = raw.match(/(?:PAT|GITHUB_TOKEN|GITHUB_PAT)\s*=\s*([^\s\r\n]+)/);
        const pat = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
        if (pat && pat.length > 10) {
          if (DEBUG) console.error('Using token from:', envPath);
          return pat;
        }
        if (DEBUG)
          console.error(
            'No PAT line in:',
            envPath,
            'content length:',
            raw.length,
            'preview:',
            raw.slice(0, 30) + '...',
          );
      } catch (e) {
        if (DEBUG) console.error('Read error', envPath, e.message);
      }
    }
  }
  console.error('PAT not found. Tried:');
  console.error('  ', resolve(root, '.env.local'));
  console.error('  ', resolve(scriptRoot, '.env.local'));
  console.error('');
  console.error('Either:');
  console.error('  Add PAT=ghp_xxx or GITHUB_TOKEN=ghp_xxx to .env.local in project root');
  console.error('  Or run: GITHUB_TOKEN=ghp_your_token node scripts/create-github-issues.js');
  process.exit(1);
}

async function request(pat, method, path, body = null) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const opts = {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${pat}`,
    },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${data?.message || text}`);
  }
  return data;
}

async function ensureLabels(pat) {
  for (const label of LABELS) {
    try {
      await request(pat, 'POST', `/repos/${OWNER}/${REPO}/labels`, {
        name: label.name,
        color: label.color,
        description: label.description,
      });
      console.log('Created label:', label.name);
    } catch (e) {
      if (e.message.includes('422') || e.message.includes('already exists')) {
        console.log('Label exists:', label.name);
      } else {
        throw e;
      }
    }
  }
}

async function createIssues(pat, issues) {
  let created = 0;
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    try {
      await request(pat, 'POST', `/repos/${OWNER}/${REPO}/issues`, {
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      });
      created++;
      console.log(`[${created}/${issues.length}] #${created} ${issue.title}`);
    } catch (e) {
      console.error('Failed:', issue.title, e.message);
    }
  }
  return created;
}

async function main() {
  const pat = loadPat();
  const issuesPath = resolve(root, 'docs', 'issues-data.json');
  const issues = JSON.parse(readFileSync(issuesPath, 'utf8'));
  if (issues.length !== 50) {
    console.error('Expected 50 issues in docs/issues-data.json, got', issues.length);
    process.exit(1);
  }

  console.log('Creating labels...');
  await ensureLabels(pat);
  console.log('\nCreating 50 issues...');
  const created = await createIssues(pat, issues);
  console.log('\nDone. Created', created, 'issues.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
