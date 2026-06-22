/**
 * Wallet transaction-history page (#295).
 *
 * Queries Horizon `/accounts/:address/operations` filtered to Soroban
 * invoke-host-function operations targeting the rewards + campaign
 * contracts the deployer configured. The display layer classifies
 * each operation into Register / Credit / Claim using the contract
 * id + function name, decodes the call args needed for the table
 * row, and renders rows newest-first with cursor-based pagination.
 *
 * Empty / loading / error states are all surfaced inline so the
 * caller doesn't need to wrap.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import {
  getHorizonUrl,
  getCampaignContractId,
  getRewardsContractId,
  getStellarNetwork,
} from './config';
import './Landing.css';

const PAGE_SIZE = 20;

function classifyOperation(op, rewardsId, campaignId) {
  // Soroban invokes surface as type=invoke_host_function with a
  // parameters array carrying the contract id + function name. The
  // exact JSON shape Horizon returns has shifted across SDK versions
  // — we pattern-match on the documented fields and fall through to
  // "unknown" rather than crashing.
  if (op.type !== 'invoke_host_function') return null;
  const params = op.parameters ?? op.function?.parameters ?? [];
  let contractId = '';
  let methodName = '';
  for (const p of params) {
    if (p.type === 'contract_id' || p.type === 'contractId') {
      contractId = p.value;
    }
    if (p.type === 'sym' || p.type === 'function') {
      methodName = p.value;
    }
  }
  if (!contractId) return null;

  let kind;
  if (contractId === campaignId) {
    if (methodName === 'register') kind = 'Register';
    else if (methodName === 'deregister' || methodName === 'admin_deregister') kind = 'Deregister';
    else kind = 'Campaign call';
  } else if (contractId === rewardsId) {
    if (methodName === 'credit') kind = 'Credit';
    else if (methodName === 'claim') kind = 'Claim';
    else kind = 'Rewards call';
  } else {
    return null;
  }

  return {
    kind,
    method: methodName,
    contractId,
  };
}

function explorerLink(txHash, network) {
  const network_param = network === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network_param}/tx/${txHash}`;
}

function shortenHash(hash) {
  if (!hash || hash.length < 14) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export default function TransactionHistory({
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
  const [items, setItems] = useState([]);
  const [cursorStack, setCursorStack] = useState([null]); // history of cursors for back nav
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rewardsId = useMemo(() => getRewardsContractId(), []);
  const campaignId = useMemo(() => getCampaignContractId(), []);
  const network = stellarNetwork ?? getStellarNetwork();

  const load = useCallback(
    async (cursor) => {
      if (!walletAddress) {
        setItems([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          order: 'desc',
          include_failed: 'false',
        });
        if (cursor) params.set('cursor', cursor);
        const url = `${getHorizonUrl()}/accounts/${encodeURIComponent(walletAddress)}/operations?${params.toString()}`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`Horizon returned ${response.status}`);
        }
        const body = await response.json();
        const records = body._embedded?.records ?? [];
        const filtered = records
          .map((op) => {
            const classified = classifyOperation(op, rewardsId, campaignId);
            if (!classified) return null;
            return {
              id: op.id,
              date: op.created_at,
              txHash: op.transaction_hash,
              ...classified,
            };
          })
          .filter(Boolean);
        setItems(filtered);
        // Horizon's next link carries the cursor of the last record
        // returned. When the link points back at the same query (=
        // no further pages), we treat that as "end of list".
        const nextHref = body._links?.next?.href ?? '';
        const nextMatch = nextHref.match(/[?&]cursor=([^&]+)/);
        const newCursor = nextMatch ? decodeURIComponent(nextMatch[1]) : null;
        setNextCursor(records.length === PAGE_SIZE ? newCursor : null);
      } catch (err) {
        setError(err?.message ?? 'failed to load history');
        setItems([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, rewardsId, campaignId],
  );

  useEffect(() => {
    if (walletAddress) {
      void load(cursorStack[cursorStack.length - 1]);
    }
  }, [walletAddress, cursorStack, load]);

  const onNext = () => {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, nextCursor]);
  };
  const onPrev = () => {
    if (cursorStack.length <= 1) return;
    setCursorStack((s) => s.slice(0, -1));
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
        <section className="section">
          <h2 className="section-title">Transaction history</h2>
          <p className="section-subtitle">
            Your past interactions with Trivela's rewards and campaign contracts.
          </p>

          {!walletAddress && <p role="status">Connect a wallet to view your history.</p>}

          {walletAddress && loading && <p role="status">Loading history…</p>}

          {walletAddress && !loading && error && (
            <div role="alert" className="detail-error">
              <p>Error: {error}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => load(cursorStack[cursorStack.length - 1])}
              >
                Retry
              </button>
            </div>
          )}

          {walletAddress && !loading && !error && items.length === 0 && (
            <p role="status">No Trivela transactions found for this wallet yet.</p>
          )}

          {walletAddress && !loading && !error && items.length > 0 && (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.date).toLocaleString()}</td>
                    <td>{row.kind}</td>
                    <td>
                      <code>{row.method}</code>
                    </td>
                    <td>
                      <a
                        href={explorerLink(row.txHash, network)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {shortenHash(row.txHash)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {walletAddress && !loading && !error && (items.length > 0 || cursorStack.length > 1) && (
            <div className="history-pagination">
              <button type="button" onClick={onPrev} disabled={cursorStack.length <= 1}>
                ← Newer
              </button>
              <button type="button" onClick={onNext} disabled={!nextCursor}>
                Older →
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// Exported for unit tests.
export { classifyOperation };
