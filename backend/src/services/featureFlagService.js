// @ts-check

/**
 * Evaluates percentage-based rollout using a deterministic hash of flagKey + userId.
 * @param {string} flagKey
 * @param {string} userId
 * @param {number} percentage  0–100
 */
function inPercentageRollout(flagKey, userId, percentage) {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  // Simple deterministic hash: sum char codes then mod 100
  const seed = `${flagKey}:${userId}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 100 < percentage;
}

/**
 * @param {{
 *   featureFlagRepository: ReturnType<import('../dal/sqliteFeatureFlagRepository.js').createSqliteFeatureFlagRepository>
 * }} deps
 */
export function createFeatureFlagService({ featureFlagRepository }) {
  /**
   * Evaluate whether a flag is enabled for the given context.
   * Falls back to `false` (safe default) if the store throws.
   *
   * @param {string} flagKey
   * @param {{ userId?: string, orgId?: string }} [context]
   * @returns {boolean}
   */
  function isEnabled(flagKey, context = {}) {
    try {
      const flag = featureFlagRepository.getByKey(flagKey);
      if (!flag || !flag.enabled) return false;

      const { targeting } = flag;

      // Kill-switch: if killSwitch is explicitly set, it overrides everything
      if (targeting.killSwitch === true) return false;

      const { userId, orgId } = context;

      // Org targeting: only enabled for specific orgs
      if (Array.isArray(targeting.allowedOrgs) && targeting.allowedOrgs.length > 0) {
        if (!orgId || !targeting.allowedOrgs.includes(orgId)) return false;
      }

      // User targeting: only enabled for specific users
      if (Array.isArray(targeting.allowedUsers) && targeting.allowedUsers.length > 0) {
        if (!userId || !targeting.allowedUsers.includes(userId)) return false;
      }

      // Percentage rollout: requires a userId for deterministic assignment
      if (typeof targeting.percentage === 'number') {
        if (!userId) return false;
        return inPercentageRollout(flagKey, userId, targeting.percentage);
      }

      return true;
    } catch {
      // Store unavailable → safe default is off
      return false;
    }
  }

  /**
   * Returns all flags for client hydration.
   * Falls back to empty array if the store throws.
   */
  function getAllFlags() {
    try {
      return featureFlagRepository.list();
    } catch {
      return [];
    }
  }

  /**
   * Create or update a flag (admin operation).
   * @param {{ flagKey: string, enabled?: boolean, targeting?: object, description?: string|null }} params
   */
  function setFlag({ flagKey, enabled = false, targeting = {}, description = null }) {
    return featureFlagRepository.upsert({ flagKey, enabled, targeting, description });
  }

  /**
   * Remove a flag entirely.
   * @param {string} flagKey
   */
  function deleteFlag(flagKey) {
    return featureFlagRepository.remove(flagKey);
  }

  return { isEnabled, getAllFlags, setFlag, deleteFlag };
}
