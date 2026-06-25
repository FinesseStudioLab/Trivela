import { useEffect, useState, useCallback } from 'react';
import { apiUrl } from './config.js';

const TRIVELA_URL = typeof window !== 'undefined' ? window.location.origin : 'https://trivela.app';

function statusLabel(campaign) {
  if (!campaign.active) return 'Ended';
  if (campaign.endDate && new Date(campaign.endDate) < new Date()) return 'Ended';
  return 'Active';
}

function truncate(text, max) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export default function EmbedCampaignCard({ id }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/campaigns/${id}`);
      if (!res.ok)
        throw new Error(res.status === 404 ? 'Campaign not found.' : 'Failed to load campaign.');
      setCampaign(await res.json());
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const style = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: '#0f172a',
    color: '#e2e8f0',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 16,
  };

  if (loading)
    return (
      <div style={style}>
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: '24px',
            width: '100%',
            maxWidth: 420,
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          Loading campaign…
        </div>
      </div>
    );

  if (error || !campaign)
    return (
      <div style={style}>
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: '24px',
            width: '100%',
            maxWidth: 420,
            color: '#ef4444',
            textAlign: 'center',
          }}
        >
          {error || 'Campaign not found.'}
        </div>
      </div>
    );

  const status = statusLabel(campaign);
  const isActive = status === 'Active';
  const participantCount = campaign.participantCount ?? campaign.registrations ?? 0;
  const max = campaign.maxParticipants ?? null;
  const spots = max !== null ? Math.max(0, max - participantCount) : null;
  const registerUrl = `${TRIVELA_URL}/campaign/${campaign.id}`;

  return (
    <div style={style}>
      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: '20px 24px',
          width: '100%',
          maxWidth: 420,
        }}
      >
        <p
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#64748b',
            marginBottom: 6,
          }}
        >
          Trivela Campaign
        </p>
        <h1
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          {campaign.name}
        </h1>
        {campaign.description && (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
            {truncate(campaign.description, 160)}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: isActive ? '#22c55e' : '#94a3b8',
                marginRight: 5,
                verticalAlign: 'middle',
              }}
            />
            <strong style={{ color: '#cbd5e1' }}>{status}</strong>
          </span>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Participants: <strong style={{ color: '#cbd5e1' }}>{participantCount}</strong>
          </span>
          {spots !== null && (
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Spots left: <strong style={{ color: '#cbd5e1' }}>{spots}</strong>
            </span>
          )}
          {!!campaign.rewardPerAction && (
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Reward: <strong style={{ color: '#cbd5e1' }}>{campaign.rewardPerAction} pts</strong>
            </span>
          )}
        </div>
        <a
          href={registerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 0',
            background: isActive ? '#3b82f6' : '#64748b',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9rem',
            textAlign: 'center',
            textDecoration: 'none',
            borderRadius: 8,
          }}
        >
          Register on Trivela ↗
        </a>
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: '0.68rem', color: '#475569' }}>
          Powered by{' '}
          <a
            href={TRIVELA_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#64748b', textDecoration: 'none' }}
          >
            Trivela
          </a>
        </p>
      </div>
    </div>
  );
}
