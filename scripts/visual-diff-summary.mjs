#!/usr/bin/env node
/**
 * Visual diff summary builder (issue #1363).
 *
 * Collects Playwright/Percy-style screenshot diff artifacts (actual, expected,
 * diff images) and renders a markdown report suitable for the GitHub Actions
 * run summary, so visual regressions are visible without downloading artifacts.
 *
 * Environment variables:
 *   VISUAL_DIFF_ROOT      Directory to scan (default: frontend/tests/visual)
 *   VISUAL_DIFF_REPORT    Path to Playwright JSON results (optional)
 *   VISUAL_DIFF_SUMMARY   Output markdown path (default: stdout)
 *
 * Usage:
 *   node scripts/visual-diff-summary.mjs
 */

import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.env.VISUAL_DIFF_ROOT ?? 'frontend/tests/visual';
const REPORT = process.env.VISUAL_DIFF_REPORT ?? '';
const SUMMARY_FILE = process.env.VISUAL_DIFF_SUMMARY ?? '';

/**
 * @param {string} dir
 * @param {(name: string) => boolean} predicate
 * @returns {string[]}
 */
function findFiles(dir, predicate) {
  /** @type {string[]} */
  const found = [];
  if (!existsSync(dir)) return found;

  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full);
      } else if (predicate(entry)) {
        found.push(full);
      }
    }
  };

  walk(dir);
  return found.sort();
}

function buildReport() {
  const diffs = findFiles(ROOT, (name) => name.endsWith('-diff.png'));
  const actuals = findFiles(ROOT, (name) => name.endsWith('-actual.png'));
  const expecteds = findFiles(ROOT, (name) => name.endsWith('-expected.png'));

  let testSummary = '';
  if (REPORT && existsSync(REPORT)) {
    try {
      const results = JSON.parse(readFileSync(REPORT, 'utf8'));
      const stats = results.stats ?? {};
      testSummary = [
        '',
        '## Test Results',
        '',
        '| Metric | Count |',
        '| --- | --- |',
        `| Expected | ${stats.expected ?? 0} |`,
        `| Unexpected (failures) | ${stats.unexpected ?? 0} |`,
        `| Flaky | ${stats.flaky ?? 0} |`,
        `| Skipped | ${stats.skipped ?? 0} |`,
      ].join('\n');
    } catch {
      testSummary = '';
    }
  }

  const lines = [
    '# Visual Regression Report',
    '',
    `Scanned \`${ROOT}\` for screenshot diff artifacts.`,
    '',
    '| Artifact type | Files found |',
    '| --- | --- |',
    `| Diff images (\`-diff.png\`) | ${diffs.length} |`,
    `| Actual images (\`-actual.png\`) | ${actuals.length} |`,
    `| Expected baselines (\`-expected.png\`) | ${expecteds.length} |`,
  ];

  if (diffs.length > 0) {
    lines.push('', '## Visual Diffs', '');
    for (const file of diffs) {
      lines.push(`- \`${relative(process.cwd(), file)}\``);
    }
    lines.push(
      '',
      '> Diff, actual, and expected images are uploaded as workflow artifacts.',
      '> Download the `visual-regression-diffs` artifact to inspect pixel-level changes.',
    );
  } else {
    lines.push('', 'No visual differences detected.');
  }

  if (testSummary) lines.push(testSummary);

  return lines.join('\n');
}

const report = buildReport();
if (SUMMARY_FILE) {
  writeFileSync(SUMMARY_FILE, report + '\n', 'utf8');
}
process.stdout.write(report + '\n');
