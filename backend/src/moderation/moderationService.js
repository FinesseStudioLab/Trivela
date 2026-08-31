import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BLOCKLIST_PATH = join(dirname(fileURLToPath(import.meta.url)), 'blocklist.json');

function loadBlocklistFile(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.terms) ? data.terms.map((t) => String(t).toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

function saveBlocklistFile(path, terms) {
  writeFileSync(path, JSON.stringify({ terms }, null, 2) + '\n', 'utf8');
}

async function checkOpenAI(input, fetchImpl, apiKey) {
  try {
    const response = await fetchImpl('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      return { flagged: false, categories: [] };
    }

    const data = await response.json();
    const result = data.results?.[0];
    if (!result) {
      return { flagged: false, categories: [] };
    }

    const categories = Object.entries(result.categories ?? {})
      .filter(([, hit]) => hit)
      .map(([cat]) => cat);

    return { flagged: result.flagged === true, categories };
  } catch {
    return { flagged: false, categories: [] };
  }
}

/**
 * @param {{
 *   provider?: 'local' | 'openai' | 'none',
 *   terms?: string[] | null,
 *   blocklistPath?: string,
 *   fetchImpl?: typeof globalThis.fetch,
 *   openaiApiKey?: string,
 * }} [options]
 */
export function createModerationService({
  provider = process.env.MODERATION_PROVIDER ?? 'local',
  terms = null,
  blocklistPath = DEFAULT_BLOCKLIST_PATH,
  fetchImpl = globalThis.fetch,
  openaiApiKey = process.env.OPENAI_API_KEY ?? '',
} = {}) {
  // When terms are injected directly (tests / in-process overrides), skip file I/O.
  const fileBacked = terms === null;
  let currentTerms = fileBacked
    ? loadBlocklistFile(blocklistPath)
    : terms.map((t) => String(t).toLowerCase().trim());

  /**
   * @param {{ name?: string, description?: string, tags?: string[] }} fields
   * @returns {Promise<{ flagged: boolean, categories: string[] }>}
   */
  async function check({ name = '', description = '', tags = [] } = {}) {
    if (provider === 'none') {
      return { flagged: false, categories: [] };
    }

    const combined = [name, description, ...(Array.isArray(tags) ? tags : [])]
      .filter(Boolean)
      .join(' ');

    if (!combined.trim()) {
      return { flagged: false, categories: [] };
    }

    if (provider === 'local') {
      const lower = combined.toLowerCase();
      const hit = currentTerms.some((term) => lower.includes(term));
      return { flagged: hit, categories: hit ? ['spam'] : [] };
    }

    if (provider === 'openai') {
      if (!openaiApiKey) {
        return { flagged: false, categories: [] };
      }
      return checkOpenAI(combined, fetchImpl, openaiApiKey);
    }

    return { flagged: false, categories: [] };
  }

  /** @param {string} term */
  function addTerm(term) {
    const normalized = String(term).toLowerCase().trim();
    if (!normalized || currentTerms.includes(normalized)) {
      return;
    }
    currentTerms.push(normalized);
    if (fileBacked) {
      saveBlocklistFile(blocklistPath, currentTerms);
    }
  }

  /** @param {string} term */
  function removeTerm(term) {
    const normalized = String(term).toLowerCase().trim();
    const before = currentTerms.length;
    currentTerms = currentTerms.filter((t) => t !== normalized);
    if (fileBacked && currentTerms.length !== before) {
      saveBlocklistFile(blocklistPath, currentTerms);
    }
  }

  /** @returns {string[]} */
  function getTerms() {
    return [...currentTerms];
  }

  return { check, addTerm, removeTerm, getTerms };
}
