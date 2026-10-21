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

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const SHORTENER_PATTERN = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy)\//i;
const PHISHING_PATTERNS = [
  /\b(?:seed|recovery|secret)\s+(?:phrase|words)\b/i,
  /\bprivate\s+key\b/i,
  /\b(?:send|share|enter|give)\b[^.]{0,40}\b(?:secret key|seed phrase|private key|password)\b/i,
  /\bverify\s+your\s+wallet\b/i,
  /\bwallet\s+(?:has been\s+)?(?:suspended|compromised|locked)\b/i,
];
const MAX_LINKS = 3;
const REPEATED_CHAR_RUN = /(.)\1{9,}/u;
const MIN_SHOUTING_LETTERS = 20;

/**
 * Built-in spam/phishing heuristics (#469) that run on top of the blocklist
 * for the `local` provider, so obvious abuse is caught with no external
 * service. Intentionally conservative: each rule needs a strong signal.
 * @param {string} text
 * @returns {string[]} categories hit ('spam' | 'phishing')
 */
export function detectSpamSignals(text) {
  const categories = new Set();

  const links = text.match(URL_PATTERN) ?? [];
  if (links.length > MAX_LINKS || SHORTENER_PATTERN.test(text)) {
    categories.add('spam');
  }

  if (REPEATED_CHAR_RUN.test(text)) {
    categories.add('spam');
  }

  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= MIN_SHOUTING_LETTERS) {
    const upper = letters.replace(/[^A-Z]/g, '').length;
    if (upper / letters.length > 0.8) {
      categories.add('spam');
    }
  }

  if (PHISHING_PATTERNS.some((pattern) => pattern.test(text))) {
    categories.add('phishing');
  }

  return [...categories];
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
      const blocklistHit = currentTerms.some((term) => lower.includes(term));
      const categories = new Set(detectSpamSignals(combined));
      if (blocklistHit) categories.add('spam');
      return { flagged: categories.size > 0, categories: [...categories] };
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
