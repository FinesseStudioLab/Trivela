import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 60_000;

function StatusBadge({ ratio }) {
  if (ratio === null) return <span className="badge badge-neutral">Loading…</span>;
  if (ratio >= 1.1) return <span className="badge badge-success">Solvent ✓</span>;
  if (ratio >= 1.0) return <span className="badge badge-warning">Low buffer ⚠</span>;
  return <span className="badge badge-error">Shortfall ✗</span>;
}

function MetricCard({ label, value, unit = '', sub }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">
        {value === null ? '—' : value}
        {value !== null && unit && <span className="metric-unit"> {unit}</span>}
      </p>
      {sub && <p className="metric-sub">{sub}</p>}
    </div>
  );
}

export default function ProofOfReserves({ theme }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/reserves/snapshot');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSnapshot(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const timer = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchSnapshot]);

  const ratio = snapshot?.solvencyRatio ?? null;
  const reserve = snapshot
    ? snapshot.reserveXlm.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : null;
  const liabilities = snapshot
    ? snapshot.liabilitiesXlm.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : null;
  const ttl = snapshot ? snapshot.contractTtlLedgers.toLocaleString() : null;
  const ratioDisplay = ratio !== null ? ratio.toFixed(4) : null;

  return (
    <div className={`proof-of-reserves page-container ${theme}`}>
      <header className="por-header">
        <h1 className="por-title">Proof of Reserves</h1>
        <p className="por-subtitle">
          Live on-chain verification that Trivela holds sufficient reserves to cover all outstanding
          redeemable points. Data is pulled directly from the Soroban contract — no off-chain
          intermediary.
        </p>
        <div className="por-status-row">
          <StatusBadge ratio={ratio} />
          {lastUpdated && (
            <span className="por-updated">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            className="btn btn-sm btn-ghost"
            onClick={fetchSnapshot}
            disabled={loading}
            aria-label="Refresh snapshot"
          >
            {loading ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="por-error">
          Failed to load reserve data: {error}
        </div>
      )}

      <section className="por-metrics" aria-label="Reserve metrics">
        <MetricCard
          label="On-Chain Reserve"
          value={reserve}
          unit="XLM"
          sub="Funds held in the Trivela escrow contract"
        />
        <MetricCard
          label="Outstanding Liabilities"
          value={liabilities}
          unit="XLM"
          sub="Redeemable points owed to participants"
        />
        <MetricCard
          label="Solvency Ratio"
          value={ratioDisplay}
          sub={ratio !== null && ratio < 1 ? '⚠ Shortfall detected' : 'Reserve ÷ Liabilities'}
        />
        <MetricCard
          label="Contract TTL"
          value={ttl}
          unit="ledgers"
          sub="Ledgers until contract instance may be archived"
        />
      </section>

      <section className="por-verify" aria-label="Independent verification">
        <h2>Independently Verify</h2>
        <p>
          Anyone can verify these figures directly on-chain. Query the escrow contract using the
          Stellar Expert block explorer or the Soroban RPC:
        </p>
        <ol>
          <li>
            Open{' '}
            <a
              href="https://stellar.expert/explorer/testnet"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stellar Expert
            </a>{' '}
            and search for the Trivela contract address.
          </li>
          <li>
            Read the <code>reserve</code> and <code>total_liabilities</code> storage entries.
          </li>
          <li>Confirm they match the values shown above.</li>
        </ol>
        <p className="por-auto-update">
          This page refreshes automatically every 60 seconds. The data shown is sourced from live
          Soroban RPC calls — no intermediary can alter it.
        </p>
      </section>
    </div>
  );
}
