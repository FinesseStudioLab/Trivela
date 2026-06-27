import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { apiUrl, DEFAULT_OG_IMAGE } from './config';
import Header from './components/Header';
import RegisterCampaign from './RegisterCampaign';
import StatusBadge from './components/StatusBadge';
import PageMeta from './components/PageMeta';
import { useCampaignLiveUpdates } from './hooks/useCampaignLiveUpdates';
import './CampaignDetail.css';

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

  const [referralCount, setReferralCount] = useState(0);
  const [bonusEarned, setBonusEarned] = useState(0);
  const [refLinkCopied, setRefLinkCopied] = useState(false);
  const [embedSnippetCopied, setEmbedSnippetCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrSize, setQrSize] = useState(256);

  const handleDownloadQR = () => {
    const canvas = document.getElementById('campaign-qr-code');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `trivela-campaign-${campaign?.name?.toLowerCase().replace(/\s+/g, '-') ?? 'qr'}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleCopyQRToClipboard = async () => {
    const canvas = document.getElementById('campaign-qr-code');
    if (canvas) {
      try {
        canvas.toBlob(async (blob) => {
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            alert('QR Code copied to clipboard!');
          }
        });
      } catch (err) {
        console.error('Failed to copy QR code: ', err);
      }
    }
  };

  const incomingRef = searchParams.get('ref');
  const isLoading = !campaign && !error;

  useEffect(() => {
    if (!walletAddress || !id) return;

    fetch(apiUrl(`/api/v1/campaigns/${id}/referrals/${walletAddress}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setReferralCount(data.referralCount ?? 0);
          setBonusEarned(data.bonusEarned ?? 0);
        }
      })
      .catch(() => {});
  }, [walletAddress, id]);

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

  const buildInviteLink = () => {
    const base = `${window.location.origin}/campaign/${id}`;
    return `${base}?ref=${walletAddress}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildInviteLink());
      setRefLinkCopied(true);
      setTimeout(() => setRefLinkCopied(false), 2000);
    } catch (_) {
      // Clipboard API unavailable
    }
  };

  const buildShareText = () => {
    const name = campaign?.name ?? 'this campaign';
    return encodeURIComponent(
      `Join me on ${name} and earn rewards on Stellar! ${buildInviteLink()}`,
    );
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
            <div className="detail-status">Loading campaign details...</div>
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
                  <section className="detail-section detail-on-chain">
                    <h2>On-chain status</h2>
                    <div className="detail-grid">
                      <div className="detail-stat">
                        <h3>Contract active</h3>
                        <p className="stat-value">{onChainState.isActive ? 'Yes' : 'No'}</p>
                      </div>
                      <div className="detail-stat">
                        <h3>Within window</h3>
                        <p className="stat-value">{onChainState.isWithinWindow ? 'Yes' : 'No'}</p>
                      </div>
                      <div className="detail-stat">
                        <h3>Participants</h3>
                        <p className="stat-value">{onChainState.participantCount}</p>
                      </div>
                    </div>
                  </section>
                ) : null}

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

                    <div className="referral-stats">
                      <div className="referral-stat">
                        <span className="referral-stat-value">{referralCount}</span>
                        <span className="referral-stat-label">
                          {referralCount === 1 ? 'friend invited' : 'friends invited'}
                        </span>
                      </div>
                      {campaign.referralBonusPoints > 0 ? (
                        <div className="referral-stat">
                          <span className="referral-stat-value">{bonusEarned}</span>
                          <span className="referral-stat-label">bonus pts earned</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="referral-link-row">
                      <input
                        className="referral-link-input"
                        type="text"
                        readOnly
                        value={buildInviteLink()}
                        aria-label="Your referral link"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary referral-copy-btn"
                        onClick={handleCopyLink}
                        aria-live="polite"
                      >
                        {refLinkCopied ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary qr-code-btn"
                        onClick={() => setShowQRModal(true)}
                        style={{ marginLeft: '8px' }}
                      >
                        QR Code
                      </button>
                    </div>

                    <div
                      className="referral-share-row"
                      role="group"
                      aria-label="Share on social media"
                    >
                      <a
                        href={`https://twitter.com/intent/tweet?text=${buildShareText()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn referral-share-btn referral-share-twitter"
                      >
                        Share on X
                      </a>
                      <a
                        href="https://discord.com/channels/@me"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn referral-share-btn referral-share-discord"
                        title="Open Discord and share your link"
                        onClick={handleCopyLink}
                      >
                        Share on Discord
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(buildInviteLink())}&text=${encodeURIComponent(`Join ${campaign?.name ?? 'this campaign'} on Trivela and earn Stellar rewards!`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn referral-share-btn referral-share-telegram"
                      >
                        Share on Telegram
                      </a>
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
      {showQRModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowQRModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface, #1e293b)',
              padding: '24px',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #334155)',
              width: '100%',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="qr-modal-title" style={{ margin: '0 0 16px', fontSize: '1.25rem', color: 'var(--color-text, #f8fafc)' }}>Campaign QR Code</h2>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`btn btn-sm ${qrSize === 128 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQrSize(128)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              >
                Small (128px)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${qrSize === 256 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQrSize(256)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              >
                Medium (256px)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${qrSize === 512 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQrSize(512)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              >
                Large (512px)
              </button>
            </div>

            <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'inline-block', marginBottom: '16px' }}>
              <QRCodeCanvas
                id="campaign-qr-code"
                value={buildInviteLink()}
                size={qrSize}
                level="H"
                includeMargin={true}
              />
            </div>

            <p style={{ margin: '0 0 16px', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--color-text, #f8fafc)' }}>
              {campaign?.name}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownloadQR}
              >
                Download PNG
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopyQRToClipboard}
              >
                Copy to Clipboard
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowQRModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
