import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import { apiUrl, getStellarNetwork } from '../config';
import './UserDashboard.css';

const PAGE_SIZE = 20;

function explorerLink(txHash, network) {
  const networkParam = network === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${networkParam}/tx/${txHash}`;
}

function shortenHash(hash) {
  if (!hash || hash.length < 14) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatAmount(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

function eventTypeName(type) {
  switch (type) {
    case 'credit':
      return 'Credit';
    case 'claim':
      return 'Claim';
    case 'vested_claim':
      return 'Vested Claim';
    default:
      return type;
  }
}

export default function UserDashboard({
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
  const [history, setHistory] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [historyCursorStack, setHistoryCursorStack] = useState([null]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const [vesting, setVesting] = useState([]);
  const [vestingLoading, setVestingLoading] = useState(false);
  const [vestingError, setVestingError] = useState('');

  const network = stellarNetwork ?? getStellarNetwork();

  const loadHistory = useCallback(
    async (cursor) => {
      if (!walletAddress) {
        setHistory([]);
        return;
      }
      setHistoryLoading(true);
      setHistoryError('');
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursor) params.set('cursor', cursor);
        const url = apiUrl(
          `/index/addresses/${encodeURIComponent(walletAddress)}/history?${params.toString()}`,
        );
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const body = await res.json();
        setHistory(body.data ?? []);
        setHistoryCursor(body.has_more ? body.cursor : null);
      } catch (err) {
        setHistoryError(err?.message ?? 'Failed to load history');
        setHistory([]);
        setHistoryCursor(null);
      } finally {
        setHistoryLoading(false);
      }
    },
    [walletAddress],
  );

  const loadVesting = useCallback(async () => {
    if (!walletAddress) {
      setVesting([]);
      return;
    }
    setVestingLoading(true);
    setVestingError('');
    try {
      const url = apiUrl(`/index/addresses/${encodeURIComponent(walletAddress)}/vesting`);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const body = await res.json();
      setVesting(body.data ?? []);
    } catch (err) {
      setVestingError(err?.message ?? 'Failed to load vesting data');
      setVesting([]);
    } finally {
      setVestingLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      loadHistory(historyCursorStack[historyCursorStack.length - 1]);
      loadVesting();
    } else {
      setHistory([]);
      setVesting([]);
      setHistoryCursorStack([null]);
    }
  }, [walletAddress, historyCursorStack, loadHistory, loadVesting]);

  const onNextHistory = () => {
    if (!historyCursor) return;
    setHistoryCursorStack((s) => [...s, historyCursor]);
  };

  const onPrevHistory = () => {
    if (historyCursorStack.length <= 1) return;
    setHistoryCursorStack((s) => s.slice(0, -1));
  };

  return (
    <div className="landing">
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
      <main id="main-content" className="landing-main" tabIndex="-1">
        {!walletAddress && (
          <section className="section">
            <EmptyState
              eyebrow="Dashboard"
              title="Connect your wallet"
              description="Connect a Stellar wallet to view your balance, transaction history, and vesting schedule."
            />
          </section>
        )}

        {walletAddress && (
          <>
            <section className="section">
              <h2 className="section-title">Dashboard</h2>
              <p className="section-subtitle">
                Your Trivela rewards overview — balance, history, and vesting.
              </p>

              <div className="dashboard-summary">
                <div className="summary-card">
                  <span className="summary-label">Points Balance</span>
                  <span className="summary-value">
                    {isWalletBalanceLoading ? '…' : walletBalance || '0'}
                  </span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Wallet</span>
                  <span className="summary-value summary-wallet" title={walletAddress}>
                    {shortenHash(walletAddress, 12)}
                  </span>
                </div>
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">Vesting Schedule</h2>
              <p className="section-subtitle">Your vested rewards and their unlock status.</p>

              {vestingLoading && <p role="status">Loading vesting data…</p>}

              {!vestingLoading && vestingError && (
                <div role="alert" className="detail-error">
                  <p>Error: {vestingError}</p>
                  <button type="button" className="btn btn-primary" onClick={loadVesting}>
                    Retry
                  </button>
                </div>
              )}

              {!vestingLoading && !vestingError && vesting.length === 0 && (
                <p className="dashboard-empty-text">No vesting schedules found.</p>
              )}

              {!vestingLoading && !vestingError && vesting.length > 0 && (
                <div className="vesting-list">
                  {vesting.map((schedule) => (
                    <div key={schedule.vest_id} className="vesting-item">
                      <div className="vesting-item-header">
                        <span className="vesting-label">Schedule #{schedule.vest_id}</span>
                        <span className="vesting-total">{formatAmount(schedule.total)} pts</span>
                      </div>
                      <div className="vesting-meta">
                        <span>Created at ledger {schedule.ledger ?? '—'}</span>
                        {schedule.tx_hash && (
                          <a
                            href={explorerLink(schedule.tx_hash, network)}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {shortenHash(schedule.tx_hash)} ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="section">
              <h2 className="section-title">Transaction History</h2>
              <p className="section-subtitle">
                Your credits, claims, and vested claims from Trivela contracts.
              </p>

              {historyLoading && <p role="status">Loading history…</p>}

              {!historyLoading && historyError && (
                <div role="alert" className="detail-error">
                  <p>Error: {historyError}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => loadHistory(historyCursorStack[historyCursorStack.length - 1])}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!historyLoading && !historyError && history.length === 0 && (
                <p className="dashboard-empty-text">No transactions yet.</p>
              )}

              {!historyLoading && !historyError && history.length > 0 && (
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Ledger</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row, idx) => (
                      <tr key={`${row.tx_hash}-${row.type}-${idx}`}>
                        <td>{eventTypeName(row.type)}</td>
                        <td>{formatAmount(row.amount)} pts</td>
                        <td>{row.ledger ?? '—'}</td>
                        <td>
                          {row.tx_hash ? (
                            <a
                              href={explorerLink(row.tx_hash, network)}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {shortenHash(row.tx_hash)} ↗
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!historyLoading &&
                !historyError &&
                (history.length > 0 || historyCursorStack.length > 1) && (
                  <div className="history-pagination">
                    <button
                      type="button"
                      onClick={onPrevHistory}
                      disabled={historyCursorStack.length <= 1}
                    >
                      ← Newer
                    </button>
                    <button type="button" onClick={onNextHistory} disabled={!historyCursor}>
                      Older →
                    </button>
                  </div>
                )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
