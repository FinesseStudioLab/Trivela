import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Deterministic, sorted JSON serialisation of an audit entry.
 * Only stable fields are included so the hash is reproducible.
 */
export function canonicalise({ actor, action, entity, entityId, diff, orgId, createdAt }) {
  return JSON.stringify({
    actor: actor ?? null,
    action: action ?? null,
    entity: entity ?? null,
    entityId: entityId ?? null,
    diff: diff ?? null,
    orgId: orgId ?? null,
    createdAt: createdAt ?? null,
  });
}

/**
 * SHA-256 of prevHash + canonical(entry).
 * @param {string} prevHash  hex digest of the preceding entry (or GENESIS_HASH)
 * @param {object} entry     raw audit-log fields
 * @returns {string}         hex digest
 */
export function computeEntryHash(prevHash, entry) {
  return createHash('sha256')
    .update(prevHash)
    .update(canonicalise(entry))
    .digest('hex');
}
