import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { apiUrl } from './config';
import Header from './components/Header';
import './ReferralLinkGenerator.css';

export default function ReferralLinkGenerator({
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
  const [referralCount, setReferralCount] = useState(0);
  const [bonusEarned, setBonusEarned] = useState(0);
  const [referralTier, setReferralTier] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrSize, setQrSize] = useState(256);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(apiUrl(`/api/v1/campaigns/${id}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCampaign(data);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!walletAddress || !id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch(apiUrl(`/api/v1/campaigns/${id}/referrals/${walletAddress}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setReferralCount(data.referralCount ?? 0);
          setBonusEarned(data.bonusEarned ?? 0);
          setReferralTier({
            tier: data.tier,
            nextTier: data.nextTier,
            referralsToNextTier: data.referralsToNextTier,
            tierProgressPercent: data.tierProgressPercent,
          });
        }
      })
      .catch(() => setError('Failed to load referral stats'))
      .finally(() => setIsLoading(false));
  }, [walletAddress, id]);

  const buildInviteLink = useCallback(() => {
    const base = `${window.location.origin}/campaign/${id}`;
    return `${base}?ref=${walletAddress}`;
  }, [id, walletAddress]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildInviteLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const buildShareText = () => {
    const name = campaign?.name ?? 'this campaign';
    return encodeURIComponent(
      `Join me on ${name} and earn rewards on Stellar! ${buildInviteLink()}`,
    );
  };

  const handleDownloadQR = () => {
    const canvas = document.getElementById('referral-qr-code');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `trivela-referral-${id}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (!walletAddress) {
    return (
      <div className="rlg-page">
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
        <main className="rlg-main">
          <div className="rlg-container">
            <nav className="rlg-nav">
              <Link to={`/campaign/${id}`} className="back-link">
                ← Back to campaign
              </Link>
            </nav>
            <div className="rlg-connect-prompt">
              <h2>Connect your wallet</h2>
              <p>
                Connect your Stellar wallet to generate a referral link and track your referrals.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onConnectWallet}
                disabled={isWalletLoading}
              >
                {isWalletLoading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="rlg-page">
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
      <main className="rlg-main">
        <div className="rlg-container">
          <nav className="rlg-nav">
            <Link to={`/campaign/${id}`} className="back-link">
              ← Back to campaign
            </Link>
          </nav>

          <header className="rlg-header">
            <p className="rlg-eyebrow">Campaign #{id}</p>
            <h1 className="rlg-title">
              {campaign?.name ? `${campaign.name} — Referral Link` : 'Referral Link'}
            </h1>
            <p className="rlg-subtitle">
              Share your referral link with friends. Earn bonus points for every friend who joins.
            </p>
          </header>

          {isLoading ? (
            <div className="rlg-loading">Loading referral stats...</div>
          ) : error ? (
            <div className="rlg-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <section className="rlg-stats-section">
                <h2 className="rlg-section-title">Your Referral Stats</h2>
                <div className="rlg-stats-grid">
                  <div className="rlg-stat-card">
                    <span className="rlg-stat-value">{referralCount}</span>
                    <span className="rlg-stat-label">
                      {referralCount === 1 ? 'Friend Invited' : 'Friends Invited'}
                    </span>
                  </div>
                  {campaign?.referralBonusPoints > 0 && (
                    <div className="rlg-stat-card">
                      <span className="rlg-stat-value">{bonusEarned}</span>
                      <span className="rlg-stat-label">Bonus Points Earned</span>
                    </div>
                  )}
                  {referralTier?.tier && (
                    <div className="rlg-stat-card rlg-tier-card">
                      <span className={`rlg-tier-badge rlg-tier-${referralTier.tier.id}`}>
                        {referralTier.tier.name}
                      </span>
                      <span className="rlg-stat-label">
                        {referralTier.nextTier
                          ? `${referralTier.referralsToNextTier} more to ${referralTier.nextTier.name}`
                          : 'Top tier reached'}
                      </span>
                      {referralTier.nextTier && (
                        <div className="rlg-tier-progress">
                          <div className="rlg-tier-progress-track">
                            <div
                              className="rlg-tier-progress-fill"
                              style={{ width: `${Math.max(4, referralTier.tierProgressPercent)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {campaign?.referralBonusPoints > 0 && (
                  <p className="rlg-bonus-note">
                    Earn <strong>+{campaign.referralBonusPoints} bonus points</strong> per friend
                    who registers
                  </p>
                )}
              </section>

              <section className="rlg-link-section">
                <h2 className="rlg-section-title">Your Referral Link</h2>
                <div className="rlg-link-row">
                  <input
                    className="rlg-link-input"
                    type="text"
                    readOnly
                    value={buildInviteLink()}
                    aria-label="Your referral link"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="btn btn-primary rlg-copy-btn"
                    onClick={handleCopy}
                    aria-live="polite"
                  >
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary rlg-qr-btn"
                    onClick={() => setShowQR(true)}
                  >
                    QR Code
                  </button>
                </div>
              </section>

              <section className="rlg-share-section">
                <h2 className="rlg-section-title">Share</h2>
                <div className="rlg-share-buttons" role="group" aria-label="Share on social media">
                  <a
                    href={`https://twitter.com/intent/tweet?text=${buildShareText()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn rlg-share-btn rlg-share-twitter"
                  >
                    Share on X
                  </a>
                  <a
                    href="https://discord.com/channels/@me"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn rlg-share-btn rlg-share-discord"
                    title="Open Discord and share your link"
                    onClick={handleCopy}
                  >
                    Share on Discord
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(buildInviteLink())}&text=${encodeURIComponent(`Join ${campaign?.name ?? 'this campaign'} on Trivela and earn Stellar rewards!`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn rlg-share-btn rlg-share-telegram"
                  >
                    Share on Telegram
                  </a>
                </div>
              </section>

              <section className="rlg-leaderboard-link-section">
                <Link to={`/campaign/${id}/referrals/leaderboard`} className="rlg-leaderboard-link">
                  View Referral Leaderboard →
                </Link>
              </section>
            </>
          )}
        </div>
      </main>

      <footer className="footer rlg-footer">
        <div className="footer-inner">
          <p>Copyright 2026 Trivela - Built for Stellar Wave</p>
        </div>
      </footer>

      {showQR && (
        <div
          className="rlg-modal-overlay"
          onClick={() => setShowQR(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div className="rlg-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="qr-modal-title" className="rlg-modal-title">
              Referral QR Code
            </h2>
            <div className="rlg-qr-size-buttons">
              <button
                type="button"
                className={`btn btn-sm ${qrSize === 128 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQrSize(128)}
              >
                Small
              </button>
              <button
                type="button"
                className={`btn btn-sm ${qrSize === 256 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQrSize(256)}
              >
                Medium
              </button>
              <button
                type="button"
                className={`btn btn-sm ${qrSize === 512 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQrSize(512)}
              >
                Large
              </button>
            </div>
            <div className="rlg-qr-container">
              <QRCodeCanvas
                id="referral-qr-code"
                value={buildInviteLink()}
                size={qrSize}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="rlg-qr-campaign-name">{campaign?.name}</p>
            <div className="rlg-modal-actions">
              <button type="button" className="btn btn-primary" onClick={handleDownloadQR}>
                Download PNG
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowQR(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
