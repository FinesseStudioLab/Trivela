import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiUrl } from '../config';

const POLL_INTERVAL_MS = 60_000;

const SIZE_MAP = {
  sm: { width: 320, height: 240 },
  md: { width: 400, height: 280 },
  lg: { width: 520, height: 340 },
};

function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen - 1) + '\u2026';
}

export default function EmbedCampaign() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const theme = searchParams.get('theme') === 'light' ? 'light' : 'dark';
  const sizeKey = SIZE_MAP[searchParams.get('size')] ? searchParams.get('size') : 'md';
  const { width, height } = SIZE_MAP[sizeKey];

  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);

  const fetchCampaign = useCallback(() => {
    if (!id) return;
    fetch(apiUrl(`/api/v1/campaigns/${id}`))
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        setCampaign(data.campaign ?? data);
        setError(null);
      })
      .catch(() => setError('Campaign not found'));
  }, [id]);

  useEffect(() => {
    fetchCampaign();
    const timer = setInterval(fetchCampaign, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchCampaign]);

  const isDark = theme === 'dark';
  const styles = {
    container: {
      width,
      height,
      fontFamily: 'system-ui, sans-serif',
      background: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#e2e8f0' : '#1e293b',
      borderRadius: '12px',
      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
      padding: '20px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      overflow: 'hidden',
    },
    badge: (active) => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 600,
      background: active ? '#22c55e' : '#64748b',
      color: '#ffffff',
    }),
    title: {
      margin: 0,
      fontSize: '16px',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    description: {
      margin: 0,
      fontSize: '13px',
      color: isDark ? '#94a3b8' : '#64748b',
      flex: 1,
    },
    meta: {
      fontSize: '12px',
      color: isDark ? '#64748b' : '#94a3b8',
      display: 'flex',
      gap: '12px',
    },
    btn: {
      display: 'inline-block',
      padding: '8px 16px',
      background: '#6366f1',
      color: '#ffffff',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 600,
      textDecoration: 'none',
      textAlign: 'center',
      marginTop: 'auto',
    },
  };

  if (error) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={styles.container}>
        <p style={{ color: isDark ? '#64748b' : '#94a3b8', margin: 0 }}>Loading&hellip;</p>
      </div>
    );
  }

  const isActive = campaign.active !== false && campaign.status !== 'ended';
  const participantCount = campaign.participantCount ?? campaign.participant_count ?? 0;
  const capacity = campaign.capacity ?? campaign.maxParticipants ?? null;
  const remaining = capacity != null ? capacity - participantCount : null;
  const campaignUrl = `${window.location.origin}/campaign/${id}`;

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={styles.badge(isActive)}>{isActive ? 'Active' : 'Ended'}</span>
        {remaining !== null && remaining <= 10 && remaining > 0 && (
          <span style={{ ...styles.badge(true), background: '#f59e0b' }}>
            {remaining} spots left
          </span>
        )}
      </div>
      <h2 style={styles.title}>{truncate(campaign.name, 60)}</h2>
      <p style={styles.description}>{truncate(campaign.description, 120)}</p>
      <div style={styles.meta}>
        <span>{participantCount.toLocaleString()} participants</span>
        {capacity != null && <span>of {capacity.toLocaleString()}</span>}
        {campaign.rewardPerAction != null && <span>{campaign.rewardPerAction} pts/action</span>}
      </div>
      <a href={campaignUrl} target="_blank" rel="noopener noreferrer" style={styles.btn}>
        Register on Trivela
      </a>
    </div>
  );
}
