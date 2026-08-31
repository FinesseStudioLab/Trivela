import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiUrl, DEFAULT_OG_IMAGE } from './config';
import Header from './components/Header';
import RegisterCampaign from './RegisterCampaign';
import StatusBadge from './components/StatusBadge';
import PageMeta from './components/PageMeta';
import ErrorBoundary from './ErrorBoundary';
import { useCampaignLiveUpdates } from './hooks/useCampaignLiveUpdates';
import './CampaignDetail.css';

/** Formats a duration in seconds as "2d 4h 15m" (issue #317 countdown). */
function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return null;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Live-ticking countdown/time-remaining string for a campaign window.
 * `windowStart`/`windowEnd` are unix seconds, or null when no window is
 * configured on-chain (get_window() defaults to (0, u64::MAX)).
 */
export function useCampaignCountdown(windowStart, windowEnd) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (windowStart == null || windowEnd == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [windowStart, windowEnd]);

  return useMemo(() => {
    if (windowStart == null || windowEnd == null) {
      return { label: null, phase: 'unbounded' };
    }
    const nowSec = Math.floor(now / 1000);
    if (nowSec < windowStart) {
      const text = formatCountdown(windowStart - nowSec);
      return { label: text ? `Starts in ${text}` : 'Starting now', phase: 'upcoming' };
    }
    if (nowSec <= windowEnd) {
      const text = formatCountdown(windowEnd - nowSec);
      return { label: text ? `Ends in ${text}` : 'Ending now', phase: 'active' };
    }
    return { label: 'Window closed', phase: 'ended' };
  }, [now, windowStart, windowEnd]);
}

export default function CampaignDetail({
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
  const [searchParams] = useSearchParams();
  const { campaign, onChainState, isPolling, isPaused, lastUpdated, stateToast, error, refresh } =
    useCampaignLiveUpdates({ campaignId: id, enabled: Boolean(id) });

  const [embedSnippetCopied, setEmbedSnippetCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const countdown = useCampaignCountdown(onChainState?.windowStart, onChainState?.windowEnd);

  const campaignUrl = `${window.location.origin}/campaign/${id}`;

  const handleCopyShareLink = useCallback(() => {
    navigator.clipboard.writeText(campaignUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, [campaignUrl]);

  const shareText = campaign ? `Check out "${campaign.name}" on Trivela` : 'Check out this campaign on Trivela';
  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(campaignUrl)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(campaignUrl)}&text=${encodeURIComponent(shareText)}`,
  };
  const handleCopyDiscordMessage = useCallback(() => {
    navigator.clipboard.writeText(`${shareText} — ${campaignUrl}`).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, [shareText, campaignUrl]);

  const incomingRef = searchParams.get('ref');
  const isLoading = !campaign && !error;

  const handleRegistered = useCallback(() => {
    if (!incomingRef || !walletAddress || !id) return;
    if (incomingRef === walletAddress) return;

    fetch(apiUrl(`/api/v1/campaigns/${id}/referrals`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrerAddress: incomingRef, refereeAddress: walletAddress }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => {});
  }, [incomingRef, walletAddress, id]);

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(date);
  };

  const campaignImage = campaign?.imageUrl || DEFAULT_OG_IMAGE;

  const campaignJsonLd = campaign
    ? {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: campaign.name,
        description: campaign.description || '',
        url: `${window.location.origin}/campaign/${id}`,
        image: campaign.imageUrl || undefined,
        startDate: campaign.startDate || undefined,
        endDate: campaign.endDate || undefined,
        eventStatus: campaign.active
          ? 'https://schema.org/EventScheduled'
          : 'https://schema.org/EventCancelled',
        organizer: {
          '@type': 'Organization',
          name: 'Trivela',
          url: window.location.origin,
        },
        offers: {
          '@type': 'Offer',
          name: `${campaign.rewardPerAction ?? 0} reward points per action`,
          price: '0',
          priceCurrency: 'USD',
          availability: campaign.active
            ? 'https://schema.org/InStock'
            : 'https://schema.org/SoldOut',
        },
      }
    : null;

  return (
    <div className="campaign-detail-page">
      <PageMeta
        title={campaign ? `${campaign.name} | Trivela` : 'Campaign | Trivela'}
        description={
          campaign?.description ||
          'View campaign details, register with your Stellar wallet, and earn rewards on Trivela.'
        }
        path={`/campaign/${id}`}
        image={campaignImage}
        imageAlt={campaign ? `${campaign.name} campaign share card` : 'Trivela campaign share card'}
        jsonLd={campaignJsonLd}
      />
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

      {stateToast ? (
        <div className="detail-toast" role="status">
          {stateToast}
        </div>
      ) : null}

      <main className="detail-main">
        <div className="detail-container">
          <nav className="detail-nav">
            <Link to="/" className="back-link">
              Back to campaigns
            </Link>
            <div className="detail-nav-actions">
              {!isPaused && campaign ? (
                <span className="detail-live-badge" aria-label="Live campaign data">
                  Live
                </span>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary detail-refresh-btn"
                onClick={refresh}
              >
                {isPolling ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                type="button"
                className="btn btn-secondary detail-print-btn"
                onClick={() => window.print()}
              >
                Print / Save as PDF
              </button>
              <Link
                to={`/campaign/${id}/leaderboard`}
                className="btn btn-secondary detail-leaderboard-btn"
              >
                View leaderboard
              </Link>
            </div>
          </nav>

          {isLoading ? (
            <div className="detail-skeleton" aria-busy="true" aria-label="Loading campaign details">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-badge" />
              <div className="skeleton-grid">
                <div className="skeleton-stat" />
                <div className="skeleton-stat" />
                <div className="skeleton-stat" />
              </div>
              <div className="skeleton-line skeleton-paragraph" />
              <div className="skeleton-line skeleton-paragraph" />
            </div>
          ) : error ? (
            <div className="detail-error" role="alert">
              <h2>Error</h2>
              <p>{error}</p>
              <div className="detail-actions">
                <button type="button" className="btn btn-primary" onClick={refresh}>
                  Retry request
                </button>
                <Link to="/" className="btn btn-secondary">
                  Return to landing
                </Link>
              </div>
            </div>
          ) : (
            <article className="detail-content">
              <header className="detail-header">
                <p className="detail-eyebrow">Campaign #{campaign.id}</p>
                <div className="detail-title-row">
                  <h1 className="detail-title">{campaign.name}</h1>
                  <StatusBadge status={campaign.status} />
                </div>
                {lastUpdated ? (
                  <p className="detail-updated">Last updated {lastUpdated.toLocaleTimeString()}</p>
                ) : null}
              </header>

              <div className="detail-body">
                {onChainState ? (
                  <ErrorBoundary as="div">
                    <section className="detail-section detail-on-chain">
                      <h2>On-chain status</h2>
                      <div className="detail-grid">
                        <div className="detail-stat">
                          <h3>Status</h3>
                          <p className="stat-value">
                            {onChainState.isActive
                              ? onChainState.isWithinWindow
                                ? 'Active'
                                : 'Paused'
                              : 'Inactive'}
                          </p>
                        </div>
                        <div className="detail-stat">
                          <h3>Participants</h3>
                          <p className="stat-value">
                            {onChainState.participantCount}
                            {onChainState.maxCap > 0
                              ? ` / ${onChainState.maxCap} spots`
                              : ' registered'}
                          </p>
                        </div>
                        <div className="detail-stat">
                          <h3>{countdown.phase === 'upcoming' ? 'Starts' : 'Time window'}</h3>
                          <p className="stat-value">{countdown.label ?? 'No time limit'}</p>
                        </div>
                      </div>

                      {onChainState.maxCap > 0 ? (
                        <div
                          className="cap-progress-bar"
                          role="progressbar"
                          aria-valuenow={onChainState.participantCount}
                          aria-valuemin={0}
                          aria-valuemax={onChainState.maxCap}
                          aria-label="Campaign fill rate"
                        >
                          <div
                            className="cap-progress-fill"
                            style={{
                              width: `${Math.min(
                                100,
                                (onChainState.participantCount / onChainState.maxCap) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </section>
                  </ErrorBoundary>
                ) : campaign && !campaign.contractId ? (
                  <section className="detail-section detail-no-contract">
                    <h2>On-chain status</h2>
                    <p className="detail-no-contract-note">
                      Contract not linked — this campaign doesn&apos;t have an on-chain contract
                      assigned yet, so live participant counts and status aren&apos;t available.
                    </p>
                  </section>
                ) : null}

                <section className="detail-section detail-share" aria-label="Share this campaign">
                  <h2>Share</h2>
                  <div className="detail-share-actions">
                    <button type="button" className="btn btn-secondary" onClick={handleCopyShareLink}>
                      {shareCopied ? 'Copied!' : 'Copy link'}
                    </button>
                    <a
                      className="btn btn-secondary"
                      href={shareLinks.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Share on Twitter
                    </a>
                    <button type="button" className="btn btn-secondary" onClick={handleCopyDiscordMessage}>
                      Copy Discord message
                    </button>
                    <a
                      className="btn btn-secondary"
                      href={shareLinks.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Share on Telegram
                    </a>
                  </div>
                </section>

                <section className="detail-section">
                  <h2>Description</h2>
                  <p className="detail-description">
                    {campaign.description || 'No description provided.'}
                  </p>
                </section>

                <div className="detail-grid">
                  <div className="detail-stat">
                    <h3>Reward per Action</h3>
                    <p className="stat-value">{campaign.rewardPerAction ?? 0} pts</p>
                  </div>
                  <div className="detail-stat">
                    <h3>Created On</h3>
                    <p className="stat-value">{formatDate(campaign.createdAt)}</p>
                  </div>
                </div>

                <section className="detail-cta">
                  <h3>Ready to participate?</h3>
                  <p>
                    Rewards are issued automatically through the Stellar Soroban smart contract
                    assigned to this campaign.
                  </p>

                  {walletAddress ? (
                    <RegisterCampaign
                      walletAddress={walletAddress}
                      onRegistered={handleRegistered}
                    />
                  ) : (
                    <div>
                      <button
                        className="btn btn-primary"
                        onClick={onConnectWallet}
                        disabled={isWalletLoading}
                      >
                        {isWalletLoading ? 'Connecting...' : 'Connect wallet to register'}
                      </button>
                      <p className="cta-note">
                        Connect your Freighter wallet to register for this campaign.
                      </p>
                    </div>
                  )}
                </section>

                {walletAddress ? (
                  <section className="referral-section" aria-label="Invite friends">
                    <div className="referral-header">
                      <h3 className="referral-title">Invite Friends</h3>
                      {campaign.referralBonusPoints > 0 ? (
                        <p className="referral-bonus-note">
                          Earn <strong>+{campaign.referralBonusPoints} bonus pts</strong> per friend
                          who registers
                        </p>
                      ) : null}
                    </div>

                    <div className="referral-actions-row">
                      <Link
                        to={`/campaign/${id}/referrals`}
                        className="btn btn-primary referral-manage-link"
                      >
                        Manage Referral Link
                      </Link>
                      <Link
                        to={`/campaign/${id}/referrals/leaderboard`}
                        className="btn btn-secondary referral-leaderboard-link"
                      >
                        View Leaderboard
                      </Link>
                    </div>
                  </section>
                ) : null}
              </div>

              {campaign && (
                <section
                  className="section embed-section"
                  style={{
                    marginTop: '32px',
                    padding: '20px',
                    background: 'var(--color-surface, #1e293b)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #334155)',
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Embed this campaign</h3>
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: '0.875rem',
                      color: 'var(--color-text-secondary, #94a3b8)',
                    }}
                  >
                    Copy this snippet to embed a live campaign card on any website.
                  </p>
                  <pre
                    style={{
                      background: 'var(--color-bg, #0f172a)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      overflowX: 'auto',
                      margin: '0 0 12px',
                    }}
                  >
                    <code>{`<iframe
  src="${window.location.origin}/embed/campaign/${id}?theme=dark"
  width="400"
  height="280"
  frameborder="0"
  style="border:none;border-radius:12px;"
  title="${campaign.name ?? 'Campaign'} on Trivela"
></iframe>`}</code>
                  </pre>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => {
                      const snippet = `<iframe\n  src="${window.location.origin}/embed/campaign/${id}?theme=dark"\n  width="400"\n  height="280"\n  frameborder="0"\n  style="border:none;border-radius:12px;"\n  title="${campaign.name ?? 'Campaign'} on Trivela"\n></iframe>`;
                      navigator.clipboard.writeText(snippet).then(() => {
                        setEmbedSnippetCopied(true);
                        setTimeout(() => setEmbedSnippetCopied(false), 2000);
                      });
                    }}
                  >
                    {embedSnippetCopied ? 'Copied!' : 'Copy snippet'}
                  </button>
                </section>
              )}
            </article>
          )}
        </div>
      </main>

      <footer className="footer detail-footer">
        <div className="footer-inner">
          <p>Copyright 2026 Trivela - Built for Stellar Wave</p>
        </div>
      </footer>
    </div>
  );
}
