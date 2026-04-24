import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiUrl } from './config';
import Header from './components/Header';
import RegisterCampaign from './RegisterCampaign';
import './CampaignDetail.css';

/**
 * Campaign Detail Page
 * Fetches and displays full information for a specific campaign.
 */
export default function CampaignDetail({
  theme,
  onToggleTheme,
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
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setError('');

    fetch(apiUrl(`/api/v1/campaigns/${id}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Campaign not found');
          }

          throw new Error(`API returned ${response.status}`);
        }

        return response.json();
      })
      .then((data) => {
        setCampaign(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Unable to load campaign details.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [id, retryCount]);

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <div className="campaign-detail-page">
      <Header
        theme={theme}
        onToggleTheme={onToggleTheme}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        isWalletBalanceLoading={isWalletBalanceLoading}
        isWalletLoading={isWalletLoading}
        onConnectWallet={onConnectWallet}
        onDisconnectWallet={onDisconnectWallet}
      />

      <main className="detail-main">
        <div className="detail-container">
          <nav className="detail-nav">
            <Link to="/" className="back-link">
              Back to campaigns
            </Link>
          </nav>

          {isLoading ? (
            <div className="detail-status">Loading campaign details...</div>
          ) : error ? (
            <div className="detail-error" role="alert">
              <h2>Error</h2>
              <p>{error}</p>
              <div className="detail-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setRetryCount((count) => count + 1)}
                >
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
                  <span
                    className={`campaign-badge ${campaign.active !== false ? 'campaign-badge-active' : 'campaign-badge-inactive'}`}
                  >
                    {campaign.active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </header>

              <div className="detail-body">
                <section className="detail-section">
                  <h2>Description</h2>
                  <p className="detail-description">
                    {campaign.description || 'No description provided.'}
                  </p>
                </section>

                <div className="detail-grid">
                  <div className="detail-stat">
                    <h3>Reward per Action</h3>
                    <p className="stat-value">
                      {campaign.rewardPerAction ?? 0} pts
                    </p>
                  </div>
                  <div className="detail-stat">
                    <h3>Created On</h3>
                    <p className="stat-value">
                      {formatDate(campaign.createdAt)}
                    </p>
                  </div>
                </div>

                <section className="detail-cta">
                  <h3>Ready to participate?</h3>
                  <p>
                    Rewards are issued automatically through the Stellar Soroban
                    smart contract assigned to this campaign.
                  </p>

                  {walletAddress ? (
                    <RegisterCampaign walletAddress={walletAddress} />
                  ) : (
                    <div>
                      <button
                        className="btn btn-primary"
                        onClick={onConnectWallet}
                        disabled={isWalletLoading}
                      >
                        {isWalletLoading
                          ? 'Connecting...'
                          : 'Connect wallet to register'}
                      </button>
                      <p className="cta-note">
                        Connect your Freighter wallet to register for this
                        campaign.
                      </p>
                    </div>
                  )}
                </section>
              </div>
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
