import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from './config';
import Header from './components/Header';
import VirtualizedList from './components/VirtualizedList';
import './CampaignLeaderboard.css';

const PAGE_LIMIT = 20;

function truncateAddress(address) {
  if (!address) return '';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function RankMedal({ rank }) {
  if (rank === 1)
    return (
      <span className="lb-medal lb-medal-gold" aria-label="1st place">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="lb-medal lb-medal-silver" aria-label="2nd place">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="lb-medal lb-medal-bronze" aria-label="3rd place">
        🥉
      </span>
    );
  return <span className="lb-rank-num">#{rank}</span>;
}

function SkeletonRow() {
  return (
    <div className="lb-row lb-row-skeleton" aria-hidden="true">
      <span className="lb-col-rank lb-skeleton-block lb-skeleton-sm" />
      <span className="lb-col-address lb-skeleton-block lb-skeleton-lg" />
      <span className="lb-col-points lb-skeleton-block lb-skeleton-md" />
      <span className="lb-col-claimed lb-skeleton-block lb-skeleton-md" />
      <span className="lb-col-net lb-skeleton-block lb-skeleton-md" />
    </div>
  );
}

export default function CampaignLeaderboard({
  theme,
  onToggleTheme,
  stellarNetwork,
  onChangeStellarNetwork,
  walletAddress,
  walletBalance,
  rewardsPoints,
  isWalletLoading,
  isWalletBalanceLoading,
  isRewardsPointsLoading,
  onConnectWallet,
  onDisconnectWallet,
  onRefreshPoints,
}) {
  const { id } = useParams();

  const [campaign, setCampaign] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [myRank, setMyRank] = useState(null);
  const [rankCopied, setRankCopied] = useState(false);

  const searchTimerRef = useRef(null);
  const isInitialSearchRef = useRef(true);

  // Debounce search input. Skip the very first run — `search` starts at ''
  // (matching `debouncedSearch`), so there's nothing to debounce on mount,
  // and clearing `participants` here would otherwise race with the initial
  // `fetchLeaderboard` call below and wipe out data it had already loaded.
  useEffect(() => {
    if (isInitialSearchRef.current) {
      isInitialSearchRef.current = false;
      return undefined;
    }

    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
      setParticipants([]);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Fetch campaign name for display
  useEffect(() => {
    fetch(apiUrl(`/api/v1/campaigns/${id}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCampaign(data);
      })
      .catch(() => {});
  }, [id]);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(
    async (pageNum, replace) => {
      replace ? setIsLoading(true) : setIsLoadingMore(true);
      setError('');

      const qs = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_LIMIT) });
      if (debouncedSearch) qs.set('q', debouncedSearch);

      try {
        const res = await fetch(apiUrl(`/api/v1/campaigns/${id}/leaderboard?${qs}`));
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const json = await res.json();

        const rows = json.data ?? [];
        setTotal(json.pagination?.total ?? rows.length);
        setHasMore(json.pagination?.hasNextPage ?? false);

        if (replace) {
          setParticipants(rows);
        } else {
          setParticipants((prev) => [...prev, ...rows]);
        }
      } catch (err) {
        setError(err.message || 'Unable to load leaderboard.');
      } finally {
        replace ? setIsLoading(false) : setIsLoadingMore(false);
      }
    },
    [id, debouncedSearch],
  );

  // Reload from page 1 when search changes
  useEffect(() => {
    fetchLeaderboard(1, true);
  }, [fetchLeaderboard]);

  // Fetch the connected wallet's rank
  useEffect(() => {
    if (!walletAddress || !id) {
      setMyRank(null);
      return;
    }

    fetch(
      apiUrl(
        `/api/v1/campaigns/${id}/leaderboard/rank?wallet=${encodeURIComponent(walletAddress)}`,
      ),
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMyRank(data);
      })
      .catch(() => {
        setMyRank(null);
      });
  }, [walletAddress, id]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLeaderboard(nextPage, false);
  };

  // Infinite scroll: the virtualized list calls this as the user nears the end.
  // Guarded so it only advances the cursor once per page.
  const handleReachEnd = useCallback(() => {
    if (!hasMore || isLoadingMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLeaderboard(nextPage, false);
  }, [hasMore, isLoadingMore, isLoading, page, fetchLeaderboard]);

  const buildShareText = (rank) => {
    const name = campaign?.name ?? 'this campaign';
    const rankStr = rank != null ? `#${rank} of ${total}` : 'the top';
    return encodeURIComponent(
      `I'm ranked ${rankStr} on the ${name} leaderboard on Trivela! 🏆 ${window.location.origin}/campaign/${id}/leaderboard`,
    );
  };

  const handleCopyRank = async () => {
    const rank = myRank?.rank;
    const text = `I'm ranked #${rank} of ${total} on the ${campaign?.name ?? 'Trivela'} leaderboard! ${window.location.origin}/campaign/${id}/leaderboard`;
    try {
      await navigator.clipboard.writeText(text);
      setRankCopied(true);
      setTimeout(() => setRankCopied(false), 2000);
    } catch (_) {
      // Clipboard failures are non-fatal and do not require user-facing action
    }
  };

  const isMyRow = (address) =>
    walletAddress && address?.toLowerCase() === walletAddress.toLowerCase();

  return (
    <div className="lb-page">
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

      <main className="lb-main">
        <div className="lb-container">
          <nav className="lb-nav">
            <Link to={`/campaign/${id}`} className="back-link">
              ← Back to campaign
            </Link>
          </nav>

          <header className="lb-header">
            <p className="lb-eyebrow">Campaign #{id}</p>
            <h1 className="lb-title">
              {campaign?.name ? `${campaign.name} — Leaderboard` : 'Leaderboard'}
            </h1>
            <p className="lb-subtitle">Participants ranked by reward points earned</p>
          </header>

          {/* Connected wallet rank banner */}
          {walletAddress && myRank && (
            <div className="lb-my-rank-banner" role="status">
              <span className="lb-my-rank-text">
                Your rank: <strong>#{myRank.rank}</strong> of {total.toLocaleString()} participants
              </span>
              <div className="lb-share-row">
                <button
                  type="button"
                  className="btn lb-share-btn lb-share-twitter"
                  onClick={() =>
                    window.open(
                      `https://twitter.com/intent/tweet?text=${buildShareText(myRank.rank)}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  Share on X
                </button>
                <button
                  type="button"
                  className="btn lb-share-btn lb-share-discord"
                  onClick={handleCopyRank}
                  title="Copy rank text to share on Discord"
                >
                  {rankCopied ? 'Copied!' : 'Share on Discord'}
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="lb-search-row">
            <input
              className="lb-search-input"
              type="search"
              placeholder="Search by wallet address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter leaderboard by wallet address"
            />
            {total > 0 && !isLoading && (
              <span className="lb-total-count">
                {total.toLocaleString()} participant{total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Table header */}
          <div className="lb-table">
          <div
            className="lb-table-inner"
            role="table"
            aria-label="Campaign leaderboard"
            aria-rowcount={total + 1}
          >
            <div className="lb-row lb-row-header" role="row" aria-rowindex={1}>
              <span className="lb-col-rank" role="columnheader">
                Rank
              </span>
              <span className="lb-col-address" role="columnheader">
                Wallet
              </span>
              <span className="lb-col-points" role="columnheader">
                Points
              </span>
              <span className="lb-col-claimed" role="columnheader">
                Claimed
              </span>
              <span className="lb-col-net" role="columnheader">
                Net Balance
              </span>
            </div>

            {isLoading ? (
              Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
            ) : error ? (
              <div className="lb-state lb-error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => fetchLeaderboard(1, true)}
                >
                  Retry
                </button>
              </div>
            ) : participants.length === 0 ? (
              <div className="lb-state lb-empty">
                <p className="lb-empty-icon">🏁</p>
                <p className="lb-empty-heading">No participants yet</p>
                <p className="lb-empty-sub">
                  {debouncedSearch
                    ? 'No participants match that wallet address.'
                    : 'Be the first to join this campaign and top the leaderboard!'}
                </p>
              </div>
            ) : (
              <VirtualizedList
                items={participants}
                getKey={(p) => p.walletAddress ?? p.rank}
                estimateSize={56}
                className="lb-virtual-viewport"
                containerProps={{ role: 'rowgroup', 'aria-label': 'Leaderboard participants' }}
                onReachEnd={handleReachEnd}
                getItemProps={(p, i) => ({
                  className: `lb-row lb-row-data${isMyRow(p.walletAddress) ? ' lb-row-mine' : ''}`,
                  role: 'row',
                  'aria-rowindex': i + 2,
                  'aria-current': isMyRow(p.walletAddress) ? 'true' : undefined,
                })}
                renderItem={(p) => (
                  <>
                    <span className="lb-col-rank" role="cell">
                      <RankMedal rank={p.rank} />
                    </span>
                    <span className="lb-col-address" role="cell" title={p.walletAddress}>
                      {truncateAddress(p.walletAddress)}
                      {isMyRow(p.walletAddress) && <span className="lb-you-badge">You</span>}
                    </span>
                    <span className="lb-col-points" role="cell">
                      {(p.points ?? 0).toLocaleString()}
                    </span>
                    <span className="lb-col-claimed" role="cell">
                      {(p.claimedPoints ?? 0).toLocaleString()}
                    </span>
                    <span className="lb-col-net" role="cell">
                      {((p.points ?? 0) - (p.claimedPoints ?? 0)).toLocaleString()}
                    </span>
                  </>
                )}
              />
            )}
          </div>
          </div>

          {/* Load more */}
          {!isLoading && !error && hasMore && (
            <div className="lb-load-more-row">
              <button
                type="button"
                className="btn btn-secondary lb-load-more-btn"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="footer lb-footer">
        <div className="footer-inner">
          <p>Copyright 2026 Trivela - Built for Stellar Wave</p>
        </div>
      </footer>
    </div>
  );
}
