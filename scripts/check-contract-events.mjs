#!/usr/bin/env node
/**
 * Contract event logging standard — catalog generator & linter (#1196).
 *
 * Scans every `env.events().publish(...)` call in the workspace contracts,
 * enforces the event standard documented in docs/EVENT_SCHEMA.md, and keeps
 * the generated event catalog in that file in sync with the source.
 *
 *   node scripts/check-contract-events.mjs          # lint + verify catalog (CI)
 *   node scripts/check-contract-events.mjs --write  # regenerate the catalog
 *
 * Rules (see docs/EVENT_SCHEMA.md → "Event logging standard"):
 *   E1  topics must be a tuple whose first element is the event discriminant
 *       Symbol (so indexers can filter on topic[0]).
 *   E2  the discriminant must be a named `*_EVENT` const declared with
 *       `symbol_short!` — no inline `Symbol::new(...)` / `symbol_short!(...)`
 *       at the call site. Pre-existing inline names are grandfathered in
 *       LEGACY_INLINE_EVENTS and must not grow.
 *   E3  the catalog in docs/EVENT_SCHEMA.md must match the source exactly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Workspace contracts (see Cargo.toml `members`) and their display names. */
export const CONTRACTS = [
  { name: 'RewardsContract', file: 'contracts/rewards/src/lib.rs' },
  { name: 'CampaignContract', file: 'contracts/campaign/src/lib.rs' },
  { name: 'NullifierRegistry', file: 'contracts/nullifiers/src/lib.rs' },
];

export const SCHEMA_DOC = 'docs/EVENT_SCHEMA.md';
export const BEGIN_MARKER = '<!-- BEGIN GENERATED EVENT CATALOG (scripts/check-contract-events.mjs --write) -->';
export const END_MARKER = '<!-- END GENERATED EVENT CATALOG -->';

/**
 * Inline discriminants that predate the standard (rule E2). Indexers already
 * depend on these names, so they are kept as-is; new events must use a
 * `*_EVENT` constant instead.
 */
export const LEGACY_INLINE_EVENTS = new Set([
  'RewardsContract:tier_credit',
  'RewardsContract:set_tiers',
  'RewardsContract:clear_tiers',
  'CampaignContract:deregister',
]);

/** Map `const NAME: Symbol = symbol_short!("value");` declarations. */
export function parseSymbolConsts(source) {
  const consts = new Map();
  const re = /const\s+([A-Z0-9_]+)\s*:\s*Symbol\s*=\s*symbol_short!\(\s*"([^"]+)"\s*\)/g;
  for (const m of source.matchAll(re)) consts.set(m[1], m[2]);
  return consts;
}

/** Split a comma-separated argument list at depth 0. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/**
 * Extract every `.publish(topics, data)` call.
 * @returns {{ line: number, fn: string, topics: string[], data: string, raw: string }[]}
 */
export function parsePublishCalls(source) {
  const code = stripComments(source);
  const calls = [];
  const re = /\.publish\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
      i++;
    }
    const args = splitTopLevel(code.slice(start, i - 1).replace(/\s+/g, ' '));
    const before = code.slice(0, m.index);
    const line = before.split('\n').length;
    const fns = [...before.matchAll(/\bfn\s+([A-Za-z0-9_]+)\s*[<(]/g)];
    const fn = fns.length ? fns[fns.length - 1][1] : '(top level)';
    const topicsExpr = args[0] ?? '';
    const topics = topicsExpr.startsWith('(') && topicsExpr.endsWith(')')
      ? splitTopLevel(topicsExpr.slice(1, -1))
      : [topicsExpr];
    calls.push({ line, fn, topics, data: args.slice(1).join(', '), raw: topicsExpr });
  }
  return calls;
}

/**
 * Resolve a call's discriminant and check rules E1/E2.
 * @returns {{ event: string | null, constName: string | null, inline: boolean, error?: string }}
 */
export function resolveDiscriminant(call, consts) {
  const first = call.topics[0] ?? '';
  if (!call.raw.startsWith('(')) {
    return { event: null, constName: null, inline: false, error: 'E1: topics must be a tuple `(EVENT, ...)`' };
  }
  if (consts.has(first)) return { event: consts.get(first), constName: first, inline: false };
  const inline = first.match(/^(?:Symbol::new\([^,]+,\s*|symbol_short!\()\s*"([^"]+)"\s*\)$/);
  if (inline) return { event: inline[1], constName: null, inline: true };
  return {
    event: null,
    constName: null,
    inline: false,
    error: `E1: first topic \`${first}\` is not an event Symbol`,
  };
}

/** Collect catalog rows and rule violations for all contracts. */
export function analyze(readFile = (p) => readFileSync(join(ROOT, p), 'utf8')) {
  const rows = [];
  const errors = [];
  for (const contract of CONTRACTS) {
    const source = readFile(contract.file);
    const consts = parseSymbolConsts(source);
    for (const call of parsePublishCalls(source)) {
      const where = `${contract.file}:${call.line}`;
      const d = resolveDiscriminant(call, consts);
      if (d.error) {
        errors.push(`${where} ${d.error}`);
        continue;
      }
      if (d.inline && !LEGACY_INLINE_EVENTS.has(`${contract.name}:${d.event}`)) {
        errors.push(
          `${where} E2: event "${d.event}" uses an inline Symbol; declare a \`*_EVENT\` const with symbol_short! instead`,
        );
      }
      rows.push({
        contract: contract.name,
        event: d.event,
        constName: d.constName ?? '(inline, legacy)',
        topics: call.topics.slice(1).map((t) => t.replace(/\.clone\(\)/g, '')),
        data: call.data.replace(/\.clone\(\)/g, ''),
        fn: call.fn,
        where,
      });
    }
  }
  return { rows, errors };
}

function cell(text) {
  return text.replace(/\|/g, '\\|');
}

/** Render the markdown catalog (deterministic ordering). */
export function renderCatalog(rows) {
  const out = [BEGIN_MARKER, ''];
  for (const contract of CONTRACTS) {
    const own = rows
      .filter((r) => r.contract === contract.name)
      .sort((a, b) => a.event.localeCompare(b.event) || a.fn.localeCompare(b.fn));
    out.push(`### ${contract.name} (\`${contract.file}\`)`, '');
    out.push('| Event (`topic[0]`) | Const | Indexed topics | Data | Emitted in |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const r of own) {
      const topics = r.topics.length ? r.topics.map((t) => `\`${cell(t)}\``).join(', ') : '—';
      const data = r.data ? `\`${cell(r.data)}\`` : '—';
      out.push(`| \`${r.event}\` | \`${r.constName}\` | ${topics} | ${data} | \`${r.fn}()\` |`);
    }
    out.push('');
  }
  out.push(END_MARKER);
  return out.join('\n');
}

export function replaceCatalog(doc, catalog) {
  const start = doc.indexOf(BEGIN_MARKER);
  const end = doc.indexOf(END_MARKER);
  if (start === -1 || end === -1) throw new Error(`${SCHEMA_DOC} is missing the catalog markers`);
  return doc.slice(0, start) + catalog + doc.slice(end + END_MARKER.length);
}

function main() {
  const write = process.argv.includes('--write');
  const { rows, errors } = analyze();
  const docPath = join(ROOT, SCHEMA_DOC);
  const doc = readFileSync(docPath, 'utf8');
  const next = replaceCatalog(doc, renderCatalog(rows));

  if (write) {
    writeFileSync(docPath, next);
    console.log(`Wrote ${rows.length} events to ${SCHEMA_DOC}`);
  } else if (next !== doc) {
    errors.push(`E3: ${SCHEMA_DOC} event catalog is stale — run \`node scripts/check-contract-events.mjs --write\``);
  }

  if (errors.length) {
    console.error(`Contract event standard violations (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Contract events OK: ${rows.length} publish sites across ${CONTRACTS.length} contracts.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
