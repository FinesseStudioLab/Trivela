#!/usr/bin/env node
// Builds a GitHub Actions run summary for Playwright visual diffs (#1363).
// Usage: node scripts/visual-diff-summary.mjs [resultsDir] [--artifact=name] [--out=file]
// Writes markdown to --out, or $GITHUB_STEP_SUMMARY, or stdout.
import { readdirSync, statSync, existsSync, appendFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const KINDS = ['expected', 'actual', 'diff'];
const IMAGE_RE = /^(.*)-(expected|actual|diff)\.png$/;

export function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Group *-expected/actual/diff.png files by snapshot; only groups with a diff are failures. */
export function collectDiffs(dir) {
  const groups = new Map();
  for (const file of walk(dir)) {
    const m = IMAGE_RE.exec(file.split(sep).pop());
    if (!m) continue;
    const key = join(file.slice(0, file.length - file.split(sep).pop().length), m[1]);
    const g = groups.get(key) ?? { name: relative(dir, key).split(sep).join('/') };
    g[m[2]] = relative(dir, file).split(sep).join('/');
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.diff)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function renderSummary(diffs, { artifact = 'visual-regression-diffs', runUrl = '' } = {}) {
  const lines = ['## Visual regression report', ''];
  if (diffs.length === 0) {
    lines.push('No visual differences detected.');
    return lines.join('\n') + '\n';
  }
  lines.push(`**${diffs.length}** screenshot(s) differ from the baseline.`, '');
  const where = runUrl ? `[${artifact}](${runUrl})` : `\`${artifact}\``;
  lines.push(`Expected, actual and diff images are in the ${where} artifact of this run.`, '');
  lines.push('| Snapshot | Expected | Actual | Diff |', '| --- | --- | --- | --- |');
  for (const d of diffs) {
    const cell = (k) => (d[k] ? `\`${d[k].split('/').pop()}\`` : '—');
    lines.push(`| ${d.name.replace(/\|/g, '\\|')} | ${cell('expected')} | ${cell('actual')} | ${cell('diff')} |`);
  }
  lines.push('', 'If the change is intentional, run `npm run test:visual:update` in `frontend/` and commit the new baselines.');
  return lines.join('\n') + '\n';
}

function main(argv) {
  const opts = Object.fromEntries(
    argv.filter((a) => a.startsWith('--')).map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    }),
  );
  const dir = argv.find((a) => !a.startsWith('--')) ?? 'frontend/test-results';
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}#artifacts`
      : '';
  const md = renderSummary(collectDiffs(dir), { artifact: opts.artifact || undefined, runUrl });
  const target = opts.out || process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, md);
  else process.stdout.write(md);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
