import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from './config';
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription';
import Header from './components/Header';
import EmptyState from './components/EmptyState';
import './ReferralLeaderboard.css';

const PAGE_LIMIT = 20;
const POLL_INTERVAL_MS = 15_000;

function truncateAddress(address) {
  if (!address) return '';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function RankBadge({ rank, tied }) {
  if (rank === 1)
    return (
      <span className="rl-medal rl-medal-gold" aria-label="1st place">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="rl-medal rl-medal-silver" aria-label="2nd place">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="rl-medal rl-medal-bronze" aria-label="3rd place">
        🥉
      </span>
    );
  return (
    <span className="rl-rank-num">
      #{rank}
      {tied && (
        <span className="rl-tie-badge" title="Tied with another referrer">
          tie
        </span>
      )}
    </span>
  );
}

function TierBadge({ tier }) {
  if (!tier) return null;
  return <span className={`rl-tier-badge rl-tier-${tier.id}`}>{tier.name}</span>;
}

function TierProgressBar({ nextTier, referralsToNextTier, tierProgressPercent }) {
  if (!nextTier) {
    return <span className="rl-tier-maxed">Max tier</span>;
  }
  return (
    <div className="rl-tier-progress" title={`${referralsToNextTier} more to ${nextTier.name}`}>
      <div className="rl-tier-progress-track">
        <div
          className="rl-tier-progress-fill"
          style={{ width: `${Math.max(4, tierProgressPercent)}%` }}
        />
      </div>
      <span className="rl-tier-progress-label">
        {referralsToNextTier} to {nextTier.name}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rl-row rl-row-skeleton" aria-hidden="true">
      <span className="rl-col-rank rl-skeleton-block rl-skeleton-sm" />
      <span className="rl-col-address rl-skeleton-block rl-skeleton-lg" />
      <span className="rl-col-count rl-skeleton-block rl-skeleton-sm" />
      <span className="rl-col-tier rl-skeleton-block rl-skeleton-md" />
      <span className="rl-col-progress rl-skeleton-block rl-skeleton-lg" />
    </div>
  );
}

export default function ReferralLeaderboard({
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

  const [campaign, setCampaign] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [myRank, setMyRank] = useState(null);

  const refetchTimerRef = useRef(null);

  useEffect(() => {
    fetch(apiUrl(`/api/v1/campaigns/${id}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCampaign(data);
      })
      .catch(() => {});
  }, [id]);

  const fetchLeaderboard = useCallback(
    async (pageNum, replace) => {
      replace ? setIsLoading(true) : setIsLoadingMore(true);
      setError('');

      const qs = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_LIMIT) });

      try {
        const res = await fetch(apiUrl(`/api/v1/campaigns/${id}/referrals/leaderboard?${qs}`));
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const json = await res.json();

        const data = json.data ?? [];
        setTotal(json.pagination?.total ?? data.length);
        setHasMore(json.pagination?.hasNextPage ?? false);
        setRows((prev) => (replace ? data : [...prev, ...data]));
      } catch (err) {
        setError(err.message || 'Unable to load the referral leaderboard.');
      } finally {
        replace ? setIsLoading(false) : setIsLoadingMore(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchLeaderboard(1, true);
  }, [fetchLeaderboard]);

  const fetchMyRank = useCallback(() => {
    if (!walletAddress || !id) {
      setMyRank(null);
      return;
    }

    fetch(
      apiUrl(
        `/api/v1/campaigns/${id}/referrals/leaderboard/rank?wallet=${encodeURIComponent(walletAddress)}`,
      ),
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMyRank(data);
      })
      .catch(() => setMyRank(null));
  }, [walletAddress, id]);

  useEffect(() => {
    fetchMyRank();
  }, [fetchMyRank]);

  // Live updates: the backend broadcasts a `referral` event on this stream
  // whenever a new referral is recorded for the campaign. Debounce refetches
  // so a burst of referrals doesn't hammer the API.
  const handleLiveEvent = useCallback(() => {
    clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      fetchLeaderboard(1, true);
      fetchMyRank();
    }, 400);
  }, [fetchLeaderboard, fetchMyRank]);

  const { isLive } = useRealtimeSubscription({
    url: id ? apiUrl(`/api/v1/campaigns/${id}/leaderboard/stream`) : '',
    enabled: Boolean(id),
    onEvent: handleLiveEvent,
  });

  // Fallback polling while the live stream isn't connected (e.g. SSE
  // unsupported or the connection dropped) so the board still stays fresh.
  useEffect(() => {
    if (isLive) return undefined;
    const interval = setInterval(() => {
      fetchLeaderboard(1, true);
      fetchMyRank();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLive, fetchLeaderboard, fetchMyRank]);

  useEffect(() => () => clearTimeout(refetchTimerRef.current), []);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLeaderboard(nextPage, false);
  };

  const isMyRow = (address) =>
    walletAddress && address?.toLowerCase() === walletAddress.toLowerCase();

  return (
    <div className="rl-page">
      <Header
        theme={theme}
        onToggleTheme={onToggleTheme}
        stellarNetwork={stellarNetwork}
        onChangeStellarNetwork={onChangeStellarNetwork}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        isWalletBalanceLoading={isWalletBalanceLoading}
        isWalletLoading={isWalletLoading}
        onConnectWallet={onConnectWallet}
        onDisconnectWallet={onDisconnectWallet}
      />

      <main className="rl-main">
        <div className="rl-container">
          <nav className="rl-nav">
            <Link to={`/campaign/${id}`} className="back-link">
              ← Back to campaign
            </Link>
          </nav>

          <header className="rl-header">
            <p className="rl-eyebrow">Campaign #{id}</p>
            <h1 className="rl-title">
              {campaign?.name ? `${campaign.name} — Top Referrers` : 'Top Referrers'}
            </h1>
            <p className="rl-subtitle">
              Ranked by friends invited. Climb the tiers to unlock bigger referral perks.
            </p>
            <span
              className={`rl-live-indicator ${isLive ? 'rl-live-on' : 'rl-live-off'}`}
              role="status"
            >
              <span className="rl-live-dot" aria-hidden="true" />
              {isLive ? 'Live' : 'Updating periodically'}
            </span>
          </header>

          {walletAddress && myRank && (
            <div className="rl-my-rank-banner" role="status">
              <div>
                <span className="rl-my-rank-text">
                  {myRank.rank ? (
                    <>
                      Your rank: <strong>#{myRank.rank}</strong> of {total.toLocaleString()}{' '}
                      referrers
                    </>
                  ) : (
                    'Invite a friend to join the leaderboard!'
                  )}
                </span>
                <TierBadge tier={myRank.tier} />
              </div>
              <TierProgressBar
                nextTier={myRank.nextTier}
                referralsToNextTier={myRank.referralsToNextTier}
                tierProgressPercent={myRank.tierProgressPercent}
              />
            </div>
          )}

          <div className="rl-table">
            <div
              className="rl-table-inner"
              role="table"
              aria-label="Referral leaderboard"
              aria-rowcount={total + 1}
            >
              <div className="rl-row rl-row-header" role="row" aria-rowindex={1}>
                <span className="rl-col-rank" role="columnheader">
                  Rank
                </span>
                <span className="rl-col-address" role="columnheader">
                  Referrer
                </span>
                <span className="rl-col-count" role="columnheader">
                  Referrals
                </span>
                <span className="rl-col-tier" role="columnheader">
                  Tier
                </span>
                <span className="rl-col-progress" role="columnheader">
                  Progress
                </span>
              </div>

              {isLoading ? (
                Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
              ) : error ? (
                <div className="rl-state rl-error" role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => fetchLeaderboard(1, true)}
                  >
                    Retry
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  eyebrow="Referral leaderboard"
                  title="🔗 No referrers yet"
                  description="Be the first to invite a friend and top the referral leaderboard!"
                />
              ) : (
                rows.map((row, i) => {
                  const tied = i > 0 && rows[i - 1].rank === row.rank;
                  return (
                    <div
                      key={row.walletAddress}
                      className={`rl-row rl-row-data${isMyRow(row.walletAddress) ? ' rl-row-mine' : ''}`}
                      role="row"
                      aria-rowindex={i + 2}
                      aria-current={isMyRow(row.walletAddress) ? 'true' : undefined}
                    >
                      <span className="rl-col-rank" role="cell">
                        <RankBadge rank={row.rank} tied={tied} />
                      </span>
                      <span className="rl-col-address" role="cell" title={row.walletAddress}>
                        {truncateAddress(row.walletAddress)}
                        {isMyRow(row.walletAddress) && <span className="rl-you-badge">You</span>}
                      </span>
                      <span className="rl-col-count" role="cell">
                        {row.referralCount.toLocaleString()}
                      </span>
                      <span className="rl-col-tier" role="cell">
                        <TierBadge tier={row.tier} />
                      </span>
                      <span className="rl-col-progress" role="cell">
                        <TierProgressBar
                          nextTier={row.nextTier}
                          referralsToNextTier={row.referralsToNextTier}
                          tierProgressPercent={row.tierProgressPercent}
                        />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {!isLoading && !error && hasMore && (
            <div className="rl-load-more-row">
              <button
                type="button"
                className="btn btn-secondary rl-load-more-btn"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="footer rl-footer">
        <div className="footer-inner">
          <p>Copyright 2026 Trivela - Built for Stellar Wave</p>
        </div>
      </footer>
    </div>
  );
}
