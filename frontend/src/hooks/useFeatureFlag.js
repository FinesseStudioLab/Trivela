import { useFeatureFlagContext } from '../lib/FeatureFlagContext';

/**
 * Returns whether a named feature flag is enabled for the current session.
 * Reads from the flag map hydrated by FeatureFlagProvider on app start.
 * Defaults to `false` when the flag is unknown or the store was unreachable.
 *
 * @param {string} flagKey
 * @returns {boolean}
 */
export function useFeatureFlag(flagKey) {
  const flags = useFeatureFlagContext();
  return flags[flagKey] === true;
}
