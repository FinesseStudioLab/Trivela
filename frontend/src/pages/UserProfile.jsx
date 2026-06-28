import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../config';
import PageMeta from '../components/PageMeta';
import Header from '../components/Header';

function truncateAddress(addr) {
  if (!addr || addr.length <= 14) return addr ?? '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StatCard({ label, value }) {
  return (
    <div className="profile-stat-card">
      <span className="profile-stat-value">{value}</span>
      <span className="profile-stat-label">{label}</span>
    </div>
  );
}

function Skeleton({ width = '100%', height = '1.2em' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width,
        height,
        background: 'var(--color-skeleton, #334155)',
        borderRadius: '4px',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Private profile page for the connected wallet.
 * Redirects to wallet connect if no wallet is connected.
 */
export default function UserProfile({
  theme,
  onToggleTheme,
  stellarNetwork,
  onChangeStellarNetwork,
  walletAddress,
  walletBalance,
  isWalletLoading,
  isWalletBalanceLoading,
  onConnectWallet,
  onDisconnectWallet,
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletAddress && !isWalletLoading) {
      navigate('/', { replace: true });
    }
  }, [walletAddress, isWalletLoading, navigate]);

  const fetchProfile = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/participants/${walletAddress}/profile`));
      if (res.status === 404) {
        setProfile({ empty: true });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfile(data);
    } catch (err) {
      setError('Failed to load profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const copyPublicUrl = () => {
    const url = `${window.location.origin}/u/${walletAddress}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!walletAddress) return null;

  return (
    <>
      <PageMeta path="/profile" />
      <Header
        theme={theme}
        onToggleTheme={onToggleTheme}
        stellarNetwork={stellarNetwork}
        onChangeStellarNetwork={onChangeStellarNetwork}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        isWalletLoading={isWalletLoading}
        isWalletBalanceLoading={isWalletBalanceLoading}
        onConnectWallet={onConnectWallet}
        onDisconnectWallet={onDisconnectWallet}
      />

      <main className="profile-page" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>My Profile</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <code
                title={walletAddress}
                style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #94a3b8)', cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(walletAddress)}
              >
                {truncateAddress(walletAddress)}
              </code>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                (click to copy)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={copyPublicUrl}
            aria-label="Copy public profile link"
          >
            {copied ? 'Copied!' : 'Share Profile'}
          </button>
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--color-error, #ef4444)', marginBottom: '1.5rem' }}>
            {error}
          </p>
        )}

        <section aria-label="Stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="profile-stat-card">
                <Skeleton width="60%" height="2rem" />
                <Skeleton width="80%" height="1rem" />
              </div>
            ))
          ) : (
            <>
              <StatCard label="Campaigns joined" value={profile?.campaignCount ?? 0} />
              <StatCard label="Points earned" value={profile?.totalPointsEarned ?? 0} />
              <StatCard label="Points claimed" value={profile?.totalPointsClaimed ?? 0} />
              <StatCard label="Net balance" value={profile?.netPoints ?? 0} />
            </>
          )}
        </section>

        <section aria-label="Recent activity" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Recent Activity</h2>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border, #334155)' }}>
                <Skeleton width="70%" />
              </div>
            ))
          ) : !profile?.recentActivity?.length ? (
            <p style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>No activity yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {profile.recentActivity.map((event, i) => (
                <li
                  key={i}
                  style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
                >
                  <span>{event.description ?? event.action}</span>
                  <time dateTime={event.timestamp} style={{ color: 'var(--color-text-secondary, #94a3b8)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                    {new Date(event.timestamp).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Campaigns participated">
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Campaigns</h2>
          {loading ? (
            <Skeleton width="100%" height="3rem" />
          ) : !profile?.campaigns?.length ? (
            <p style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>No campaigns yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {profile.campaigns.map((c) => (
                <li key={c.id}>
                  <a href={`/campaign/${c.id}`} style={{ color: 'var(--color-primary, #38bdf8)' }}>
                    {c.name}
                  </a>
                  <span style={{ marginLeft: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    {c.pointsEarned} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {profile?.joinedDate && (
          <p style={{ marginTop: '2rem', fontSize: '0.875rem', color: 'var(--color-text-muted, #64748b)' }}>
            Member since {new Date(profile.joinedDate).toLocaleDateString()}
          </p>
        )}
      </main>
    </>
  );
}
