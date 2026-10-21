import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import './OperatorAnalytics.css';

const DATE_RANGE_OPTIONS = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

function getDateRangeParams(range) {
  if (range === 'all') return {};
  const now = new Date();
  const days = parseInt(range, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return {
    start_date: start.toISOString(),
    end_date: now.toISOString(),
  };
}

function funnelToCsv(funnelData) {
  const lines = ['stage,count'];
  if (funnelData?.stages) {
    for (const stage of funnelData.stages) {
      lines.push(`"${stage.name}",${stage.count}`);
    }
  }
  return lines.join('\n');
}

function retentionToCsv(retentionData) {
  const lines = ['metric,value'];
  if (retentionData) {
    lines.push(`total_users,${retentionData.total_users}`);
    lines.push(`avg_active_days,${retentionData.avg_active_days}`);
    lines.push(`day1_retention_rate,${retentionData.day1_retention_rate}`);
    lines.push(`day7_retention_rate,${retentionData.day7_retention_rate}`);
    lines.push(`day30_retention_rate,${retentionData.day30_retention_rate}`);
  }
  return lines.join('\n');
}

function conversionToCsv(conversionData) {
  const lines = ['conversion,rate'];
  if (conversionData) {
    for (const [key, value] of Object.entries(conversionData)) {
      lines.push(`"${key}",${value}`);
    }
  }
  return lines.join('\n');
}

export default function OperatorAnalytics({
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
  const [dateRange, setDateRange] = useState('30d');
  const [funnelData, setFunnelData] = useState(null);
  const [retentionData, setRetentionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rangeParams = getDateRangeParams(dateRange);
      const params = new URLSearchParams(rangeParams).toString();
      const funnelUrl = apiUrl(`/api/v1/analytics/funnel${params ? `?${params}` : ''}`);
      const retentionUrl = apiUrl(`/api/v1/analytics/retention${params ? `?${params}` : ''}`);

      const [funnelRes, retentionRes] = await Promise.all([fetch(funnelUrl), fetch(retentionUrl)]);

      if (!funnelRes.ok) throw new Error(`Funnel API returned ${funnelRes.status}`);
      if (!retentionRes.ok) throw new Error(`Retention API returned ${retentionRes.status}`);

      const funnel = await funnelRes.json();
      const retention = await retentionRes.json();

      setFunnelData(funnel);
      setRetentionData(retention);
    } catch (err) {
      setFunnelData(null);
      setRetentionData(null);
      setError(err.message || 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const funnelChartData = useMemo(() => {
    if (!funnelData?.stages) return [];
    return funnelData.stages.map((s) => ({ name: s.name, users: s.count }));
  }, [funnelData]);

  const retentionChartData = useMemo(() => {
    if (!retentionData) return [];
    return [
      { period: 'Day 1', rate: retentionData.day1_retention_rate },
      { period: 'Day 7', rate: retentionData.day7_retention_rate },
      { period: 'Day 30', rate: retentionData.day30_retention_rate },
    ];
  }, [retentionData]);

  const handleExportFunnel = () => {
    if (!funnelData) return;
    const blob = new Blob([funnelToCsv(funnelData)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `funnel-${dateRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRetention = () => {
    if (!retentionData) return;
    const blob = new Blob([retentionToCsv(retentionData)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `retention-${dateRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportConversion = () => {
    if (!funnelData?.conversions) return;
    const blob = new Blob([conversionToCsv(funnelData.conversions)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `conversion-rates-${dateRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    const parts = [];
    if (funnelData?.stages) parts.push(funnelToCsv(funnelData));
    if (retentionData) {
      parts.push('');
      parts.push('retention_metrics');
      parts.push(retentionToCsv(retentionData));
    }
    if (funnelData?.conversions) {
      parts.push('');
      parts.push('conversion_rates');
      parts.push(conversionToCsv(funnelData.conversions));
    }
    const blob = new Blob([parts.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `operator-analytics-${dateRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="operator-analytics-page">
      <PageMeta
        title="Operator Analytics | Trivela"
        description="Operator analytics dashboard — funnels, retention, and redemption insights."
        path="/admin/analytics"
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
      <main id="main-content" className="operator-analytics-main" tabIndex="-1">
        <div className="operator-analytics-container">
          <nav className="operator-analytics-nav">
            <Link to="/admin" className="back-link">
              Back to admin
            </Link>
          </nav>

          <header className="operator-analytics-header">
            <h1>Operator Analytics</h1>
            <div className="operator-analytics-toolbar">
              <div className="operator-analytics-range" role="group" aria-label="Date range">
                {DATE_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`btn btn-secondary operator-analytics-range-btn${dateRange === option.id ? ' is-active' : ''}`}
                    onClick={() => setDateRange(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportAll}
                disabled={loading || !funnelData}
              >
                Export All
              </button>
            </div>
          </header>

          {loading ? <p className="operator-analytics-status">Loading analytics...</p> : null}
          {!loading && error ? (
            <div className="operator-analytics-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={loadData}>
                Retry
              </button>
            </div>
          ) : null}

          {!loading && funnelData ? (
            <>
              <section className="operator-analytics-section">
                <div className="operator-analytics-section-header">
                  <h2>Participation Funnel</h2>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleExportFunnel}
                  >
                    Export CSV
                  </button>
                </div>
                <div className="operator-analytics-chart">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={funnelChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      />
                      <Tooltip />
                      <Bar dataKey="users" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {funnelData.conversions ? (
                <section className="operator-analytics-section">
                  <div className="operator-analytics-section-header">
                    <h2>Conversion Rates</h2>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleExportConversion}
                    >
                      Export CSV
                    </button>
                  </div>
                  <div className="operator-analytics-cards">
                    {Object.entries(funnelData.conversions).map(([key, value]) => (
                      <article key={key} className="operator-analytics-card">
                        <h3>{key.replace(/_/g, ' ')}</h3>
                        <p>{value}%</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {!loading && retentionData ? (
            <section className="operator-analytics-section">
              <div className="operator-analytics-section-header">
                <h2>Retention Curve</h2>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportRetention}
                >
                  Export CSV
                </button>
              </div>
              <div className="operator-analytics-cards operator-analytics-retention-summary">
                <article className="operator-analytics-card">
                  <h3>Total users</h3>
                  <p>{retentionData.total_users}</p>
                </article>
                <article className="operator-analytics-card">
                  <h3>Avg active days</h3>
                  <p>{retentionData.avg_active_days}</p>
                </article>
              </div>
              <div className="operator-analytics-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={retentionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
