import { createContext, useContext, useEffect, useState } from 'react';
import { apiUrl } from '../config';

const FeatureFlagContext = createContext({});

/**
 * Fetches all feature flags from the server on mount and provides a stable
 * key→boolean map to the React tree. Falls back to an empty map if the
 * request fails so the app keeps working when the flag store is unavailable.
 */
export function FeatureFlagProvider({ children }) {
  const [flags, setFlags] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/feature-flags'))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setFlags(data.flags ?? {});
      })
      .catch(() => {
        // Safe default: no flags enabled if store is unreachable
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <FeatureFlagContext.Provider value={flags}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlagContext() {
  return useContext(FeatureFlagContext);
}
