import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiUrl } from './config';
import Header from './components/Header';
import PageMeta from './components/PageMeta';
import './CampaignAnalytics.css';

const RANGE_OPTIONS = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

function formatDuration(ms) {
  if (ms <= 0) return 'Ended';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function statsToCsv(stats) {
  const lines = ['section,date,credited,claimed,count'];
  for (const row of stats.registrationsByDay || []) {
    lines.push(`registrations,${row.date},,,${row.count}`);
  }
  for (const row of stats.pointsByDay || []) {
    lines.push(`points,${row.date},${row.credited},${row.claimed},`);
  }
  lines.push(
    `summary,,,,"participants=${stats.summary?.totalParticipants};points=${stats.summary?.totalPoints};claimRate=${stats.summary?.claimRate}"`,
  );
  return lines.join('\n');
}

export default function CampaignAnalytics({
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
  const { id } = useParams();
  const [campaignName, setCampaignName] = useState('');
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState('7d');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [campaignRes, statsRes] = await Promise.all([
        fetch(apiUrl(`/api/v1/campaigns/${id}`)),
        fetch(apiUrl(`/api/v1/campaigns/${id}/stats?range=${encodeURIComponent(range)}`)),
      ]);

      if (!campaignRes.ok) {
        throw new Error('Campaign not found');
      }
      if (!statsRes.ok) {
        throw new Error(`Stats API returned ${statsRes.status}`);
      }

      const campaign = await campaignRes.json();
      const statsPayload = await statsRes.json();
      setCampaignName(campaign.name || `Campaign #${id}`);
      setStats(statsPayload);
    } catch (err) {
      setStats(null);
      setError(err.message || 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [id, range]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const registrationSeries = useMemo(() => stats?.registrationsByDay ?? [], [stats]);
  const pointsSeries = useMemo(() => stats?.pointsByDay ?? [], [stats]);

  const handleExportCsv = () => {
    if (!stats) return;
    const blob = new Blob([statsToCsv(stats)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `campaign-${id}-stats.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="analytics-page">
      <PageMeta
        title={`${campaignName || 'Campaign'} analytics | Trivela`}
        description="Campaign participation, points, and claim analytics for operators."
        path={`/admin/campaigns/${id}/analytics`}
      />
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
      <main id="main-content" className="analytics-main" tabIndex="-1">
        <div className="analytics-container">
          <nav className="analytics-nav">
            <Link to="/admin" className="back-link">
              Back to admin
            </Link>
            <Link to={`/campaign/${id}`} className="btn btn-secondary">
              View campaign
            </Link>
          </nav>

          <header className="analytics-header">
            <h1>{campaignName || 'Campaign analytics'}</h1>
            <div className="analytics-toolbar">
              <div className="analytics-range" role="group" aria-label="Date range">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`btn btn-secondary analytics-range-btn${range === option.id ? ' is-active' : ''}`}
                    onClick={() => setRange(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportCsv}
                disabled={!stats}
              >
                Export CSV
              </button>
            </div>
          </header>

          {loading ? <p className="analytics-status">Loading analytics...</p> : null}
          {!loading && error ? (
            <div className="analytics-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={loadStats}>
                Retry
              </button>
            </div>
          ) : null}

          {!loading && stats ? (
            <>
              {!stats.onChainSynced ? (
                <p className="analytics-notice" role="status">
                  On-chain data is not fully synced yet. Charts below use database-backed stats.
                </p>
              ) : null}

              <div className="analytics-cards">
                <article className="analytics-card">
                  <h2>Total participants</h2>
                  <p>{stats.summary.totalParticipants}</p>
                </article>
                <article className="analytics-card">
                  <h2>Total points</h2>
                  <p>{stats.summary.totalPoints}</p>
                </article>
                <article className="analytics-card">
                  <h2>Claim rate</h2>
                  <p>{stats.summary.claimRate}%</p>
                </article>
                <article className="analytics-card">
                  <h2>Time remaining</h2>
                  <p>{formatDuration(stats.summary.timeRemainingMs)}</p>
                </article>
              </div>

              <section className="analytics-chart-section">
                <h2>Participant registrations over time</h2>
                <div className="analytics-chart">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={registrationSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="var(--accent)"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="analytics-chart-section">
                <h2>Daily points credited vs. claimed</h2>
                <div className="analytics-chart">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={pointsSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="credited" fill="var(--accent)" />
                      <Bar dataKey="claimed" fill="var(--success)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
