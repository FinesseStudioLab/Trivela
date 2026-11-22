// @ts-check

/**
 * Named per-API-key rate-limit tiers (#924). `standard` matches the
 * long-standing global default (60 req/min) so existing keys — which get
 * backfilled to `standard` by migration 035 — see no behavior change.
 */
// `monthlyQuota` is a separate cap from `maxRequests`/`windowMs` (issue
// #759): the latter limits burst/sustained rate (requests per minute), the
// former limits total volume over a calendar month regardless of how it's
// spread out. `null` means unlimited.
export const RATE_TIERS = /** @type {const} */ ({
  standard: { maxRequests: 60, windowMs: 60_000, monthlyQuota: 100_000 },
  pro: { maxRequests: 300, windowMs: 60_000, monthlyQuota: 1_000_000 },
  enterprise: { maxRequests: 1_000, windowMs: 60_000, monthlyQuota: null },
});

export const DEFAULT_RATE_TIER = 'standard';

/**
 * Literal tuple (not derived from `Object.keys(RATE_TIERS)`) so zod's
 * `z.enum()` — which requires a fixed-length tuple type, not `string[]` — can
 * type-check it directly. Kept in sync with RATE_TIERS by a test asserting
 * the two lists match.
 */
export const VALID_RATE_TIERS = /** @type {const} */ (['standard', 'pro', 'enterprise']);

/**
 * @param {string | null | undefined} tier
 * @returns {{ maxRequests: number, windowMs: number }}
 */
export function getRateTierLimits(tier) {
  return RATE_TIERS[tier ?? DEFAULT_RATE_TIER] ?? RATE_TIERS[DEFAULT_RATE_TIER];
}
