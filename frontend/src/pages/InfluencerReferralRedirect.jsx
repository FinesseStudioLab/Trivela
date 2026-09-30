/**
 * Influencer referral landing — /ref/:code (#1369)
 *
 * Resolves the code against the backend (which counts the click), remembers
 * the attribution locally, then sends the visitor to the campaign (or home).
 */

import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { apiUrl } from '../config';

export const REFERRAL_STORAGE_KEY = 'trivela:influencerReferral';

export default function InfluencerReferralRedirect() {
  const { code } = useParams();
  const [state, setState] = useState({ status: 'loading', target: '/' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/referral-codes/${encodeURIComponent(code)}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        try {
          localStorage.setItem(
            REFERRAL_STORAGE_KEY,
            JSON.stringify({ code: data.code, influencerHandle: data.influencerHandle }),
          );
        } catch {
          // storage unavailable (private mode) — attribution is best effort
        }
        if (!cancelled) {
          setState({
            status: 'ok',
            target: data.campaignId ? `/campaigns/${data.campaignId}` : '/',
          });
        }
      } catch {
        if (!cancelled) setState({ status: 'invalid', target: '/' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.status === 'loading') return <p role="status">Loading…</p>;
  return <Navigate to={state.target} replace />;
}
