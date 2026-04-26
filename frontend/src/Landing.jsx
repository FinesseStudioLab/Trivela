import { useEffect, useState } from 'react';
import {
  apiUrl,
  getCampaignContract,
  getRewardsContract,
} from './config';
import ClaimRewards from './ClaimRewards';
import './Landing.css';
import RegisterCampaign from './RegisterCampaign';
import Header from './components/Header';
import CampaignCard from './components/CampaignCard';
import EmptyState from './components/EmptyState';
import { logSafeEvent } from './lib/safeAnalytics';

const STELLAR_DOCS = 'https://developers.stellar.org/docs';
const DRIP_WAVE = 'https://www.drips.network/wave/stellar';
const GITHUB_REPO = 'https://github.com/FinesseStudioLab/Trivela';
const GITHUB_ISSUES = 'https://github.com/FinesseStudioLab/Trivela/issues';
const CAMPAIGNS_PER_PAGE = 6;

function getFallbackPagination(items, page) {
  return {
    total: items.length,
    count: items.length,
    page,
    limit: CAMPAIGNS_PER_PAGE,
    offset: (page - 1) * CAMPAIGNS_PER_PAGE,
    totalPages: items.length > 0 ? 1 : 0,
    hasPreviousPage: page > 1,
    hasNextPage: false,
    previousPage: page > 1 ? page - 1 : null,
    nextPage: null,
  };
}

export default function Landing({
  runtimeConfig,
  theme,
  onToggleTheme,
  stellarNetwork,
  onChangeStellarNetwork,
  walletAddress,
  walletBalance,
  isWalletLoading,
  isWalletBalanceLoading,
  walletError,
  onConnectWallet,
  onDisconnectWallet,
  rewardsPoints,
  isRewardsPointsLoading,
  onRefreshPoints,
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsError, setCampaignsError] = useState('');
  const [isCampaignsLoading, setIsCampaignsLoading] = useState(true);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignQuery, setCampaignQuery] = useState('');
  const [campaignRefreshKey, setCampaignRefreshKey] = useState(0);
  const [pagination, setPagination] = useState(() => getFallbackPagination([], 1));
  const campaignContract = getCampaignContract();
  const rewardsContract = getRewardsContract();
  const networkLabel = runtimeConfig?.stellar?.network || 'testnet';
  const sorobanRpcUrl = runtimeConfig?.stellar?.sorobanRpcUrl || 'Not configured';
  const horizonUrl = runtimeConfig?.stellar?.horizonUrl || 'Not configured';
  const rewardsContractId = runtimeConfig?.contracts?.rewards || '';
  const campaignContractId = runtimeConfig?.contracts?.campaign || '';

  useEffect(() => {
    const controller = new AbortController();
    setIsCampaignsLoading(true);
    setCampaignsError('');

    const params = new URLSearchParams({
      page: String(campaignPage),
      limit: String(CAMPAIGNS_PER_PAGE),
    });
    if (campaignQuery.trim().length > 0) {
      params.set('q', campaignQuery.trim());
    }

    fetch(apiUrl(`/api/v1/campaigns?${params.toString()}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Campaign API returned ${response.status}`);
        }

        return response.json();
      })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : payload.data ?? payload.campaigns ?? [];
        logSafeEvent('campaigns_list_loaded', { count: items.length });
        const nextPagination = Array.isArray(payload)
          ? getFallbackPagination(items, campaignPage)
          : {
            ...getFallbackPagination(items, campaignPage),
            ...payload.pagination,
            total: payload.pagination?.total ?? items.length,
            count: payload.pagination?.count ?? items.length,
          };

        setCampaigns(items);
        setPagination(nextPagination);
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return;
        }

        setCampaigns([]);
        setPagination(getFallbackPagination([], campaignPage));
        setCampaignsError('Unable to load campaigns right now.');
        logSafeEvent('campaigns_list_failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsCampaignsLoading(false);
        }
      });

    return () => controller.abort();
  }, [campaignPage, campaignRefreshKey, campaignQuery]);

  // Removed local loadPoints effect as it is now handled in App.jsx

  const featuredCampaigns = campaigns.filter(c => c.featured);
  const otherCampaigns = campaigns.filter(c => !c.featured);

  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header
        theme={theme}
        onToggleTheme={onToggleTheme}
        stellarNetwork={stellarNetwork || runtimeConfig?.stellar?.network}
        onChangeStellarNetwork={onChangeStellarNetwork}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        isWalletBalanceLoading={isWalletBalanceLoading}
        isWalletLoading={isWalletLoading}
        onConnectWallet={onConnectWallet}
        onDisconnectWallet={onDisconnectWallet}
      />

      <main id="main-content" className="landing-main" tabIndex="-1">
        <header className="hero">
          <div className="hero-badge">
            Open source · Built for <a href={DRIP_WAVE} target="_blank" rel="noopener noreferrer">Stellar Wave</a>
          </div>
          <h1 className="hero-title">
            Campaigns & rewards
            <br />
            <span className="hero-title-accent">on Stellar Soroban</span>
          </h1>
          <p className="hero-subtitle">
            Create on-chain campaigns, award points via smart contracts, and let users claim rewards.
            Full stack: Rust contracts, Node API, React frontend.
          </p>
          <div className="hero-cta">
            <a href={GITHUB_REPO} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
              View repository
            </a>
            <a href={GITHUB_ISSUES} className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
              Browse contributor issues
            </a>
          </div>
          <div className="hero-stats" aria-label="Project summary">
            <span><strong>50</strong> open issues</span>
            <span className="hero-stats-dot" aria-hidden="true">·</span>
            <span><strong>3</strong> stacks</span>
            <span className="hero-stats-dot" aria-hidden="true">·</span>
            <span>Rust · Node · React</span>
          </div>
        </header>

        <section className="section rewards-panel" aria-labelledby="rewards-title">
          <div className="rewards-card">
            <div>
              <p className="rewards-eyebrow">Wallet rewards</p>
              <h2 id="rewards-title" className="rewards-title">My points</h2>
              <p className="rewards-copy">
                Connect your Freighter wallet to read your rewards balance directly from the
                deployed Soroban contract.
              </p>
            </div>

            <div className="rewards-balance" aria-live="polite">
              <span className="rewards-balance-label">Available points</span>
              <strong>{isRewardsPointsLoading ? '…' : (rewardsPoints || '—')}</strong>
            </div>

            <div className="rewards-actions">
              <button
                type="button"
                className="btn btn-primary btn-button"
                onClick={onConnectWallet}
                disabled={isWalletLoading}
                aria-describedby="rewards-title"
              >
                {isWalletLoading ? 'Connecting…' : walletAddress ? 'Reconnect wallet' : 'Connect wallet'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-button"
                onClick={onRefreshPoints}
                disabled={!walletAddress || isRewardsPointsLoading}
              >
                {isRewardsPointsLoading ? 'Refreshing…' : 'Refresh points'}
              </button>
            </div>

            {walletAddress && (
              <p className="rewards-wallet">
                Connected wallet: <span>{walletAddress}</span>
              </p>
            )}

            {(rewardsPoints === 'Unavailable' || walletError) && (
              <p className="rewards-error" role="alert">
                {walletError || 'Unable to load your rewards balance. Check your connection or contract deployment.'}
              </p>
            )}

            {walletAddress && (
              <ClaimRewards
                walletAddress={walletAddress}
                onClaimSuccess={() => {
                  onRefreshPoints();
                }}
              />
            )}
          </div>
        </section>

        <section className="section features" aria-labelledby="features-title">
          <h2 id="features-title" className="section-title">What’s in the stack</h2>
          <p className="section-subtitle">Soroban contracts, API, and frontend — all open for contribution.</p>
          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /></svg>
              </div>
              <h3>Soroban contracts</h3>
              <p>Rust rewards and campaign contracts for points, claims, and participant registration.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
              </div>
              <h3>Backend API</h3>
              <p>Express routes for campaigns, health checks, and public Soroban config metadata.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
              </div>
              <h3>React frontend</h3>
              <p>Vite UI with Freighter wallet connection, paginated campaigns, and contract interactions.</p>
            </article>
          </div>
          <div className="config-grid">
            <article className="config-card">
              <h3>Environment-driven wiring</h3>
              <p>
                Frontend API and Soroban targets are configured through Vite env values so each deployment
                can point at its own backend, rewards contract, and campaign contract without code changes.
                When the backend exposes `/api/v1/config`, the frontend consumes that runtime network config
                as the source of truth.
              </p>
              <ul className="config-list">
                <li><strong>Campaigns API:</strong> {apiUrl('/api/v1/campaigns')}</li>
                <li><strong>Network:</strong> {networkLabel}</li>
                <li><strong>Soroban RPC:</strong> {sorobanRpcUrl}</li>
                <li><strong>Horizon:</strong> {horizonUrl}</li>
                <li><strong>Rewards contract:</strong> {rewardsContract ? rewardsContractId : 'Not configured'}</li>
                <li><strong>Campaign contract:</strong> {campaignContract ? campaignContractId : 'Not configured'}</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section how" aria-labelledby="how-title">
          <h2 id="how-title" className="section-title">How it works</h2>
          <div className="how-grid">
            <div className="how-step">
              <span className="how-num" aria-hidden="true">1</span>
              <h3>Deploy contracts</h3>
              <p>Build and deploy the rewards and campaign contracts to Stellar testnet or mainnet.</p>
            </div>
            <div className="how-step">
              <span className="how-num" aria-hidden="true">2</span>
              <h3>Run API & frontend</h3>
              <p>Start the backend and frontend locally or in the cloud and point them at your RPC.</p>
            </div>
            <div className="how-step">
              <span className="how-num" aria-hidden="true">3</span>
              <h3>Contribute</h3>
              <p>Pick an issue from the repo and ship a focused improvement across the stack.</p>
            </div>
          </div>
        </section>

        <section className="section campaigns-preview" aria-labelledby="campaigns-title">
          <h2 id="campaigns-title" className="section-title">Live campaigns</h2>
          <p className="section-subtitle">
            Paginated from the backend API with keyboard-friendly previous and next controls.
          </p>
          <div className="campaign-search">
            <label htmlFor="campaign-search-input" className="campaign-search-label">
              Search campaigns
            </label>
            <input
              id="campaign-search-input"
              type="search"
              value={campaignQuery}
              onChange={(event) => {
                setCampaignPage(1);
                setCampaignQuery(event.target.value);
              }}
              className="campaign-search-input"
              placeholder="Search by campaign name or description"
            />
          </div>

          <div className="campaigns-panel" aria-busy={isCampaignsLoading}>
            {isCampaignsLoading ? (
              <div className="campaigns-loading" role="status">
                <span className="spinner" aria-hidden="true" />
                <p className="campaigns-loading-text">Loading campaigns…</p>
              </div>
            ) : campaignsError ? (
              <EmptyState
                eyebrow="Campaign API"
                title="We couldn’t load campaigns"
                description={campaignsError}
                actionLabel="Try again"
                onAction={() => setCampaignRefreshKey((value) => value + 1)}
              />
            ) : campaigns.length === 0 ? (
              <EmptyState
                eyebrow="Campaign API"
                title="No campaigns yet"
                description="Create a campaign through the API and it will appear here once saved."
              />
            ) : (
              <>
                {featuredCampaigns.length > 0 && (
                  <div className="featured-section">
                    <h3 className="featured-title">Featured Campaigns</h3>
                    <ul className="featured-grid">
                      {featuredCampaigns.map((campaign) => (
                        <li key={campaign.id} className="featured-grid-item">
                          <CampaignCard campaign={campaign} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <h3 className={featuredCampaigns.length > 0 ? 'all-campaigns-title' : 'sr-only'}>
                  All Campaigns
                </h3>
                <ul className="campaigns-grid">
                  {otherCampaigns.map((campaign) => (
                    <li key={campaign.id} className="campaigns-grid-item">
                      <CampaignCard campaign={campaign} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {!isCampaignsLoading && !campaignsError && pagination.totalPages > 1 && (
            <nav className="campaign-pagination" aria-label="Campaign pages">
              <button
                type="button"
                className="btn btn-secondary btn-button"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setCampaignPage((page) => Math.max(page - 1, 1))}
              >
                Previous page
              </button>

              <p className="campaign-pagination-summary" aria-live="polite">
                Page {pagination.page} of {pagination.totalPages}
                <span className="campaign-pagination-detail">
                  Showing {pagination.count} of {pagination.total} campaigns
                </span>
              </p>

              <button
                type="button"
                className="btn btn-secondary btn-button"
                disabled={!pagination.hasNextPage}
                onClick={() => setCampaignPage((page) => page + 1)}
              >
                Next page
              </button>
            </nav>
          )}

          {walletAddress && campaigns.length > 0 && (
            <RegisterCampaign walletAddress={walletAddress} />
          )}

        </section>

        <section className="cta-band" aria-labelledby="cta-title">
          <div className="cta-band-inner">
            <h2 id="cta-title" className="cta-band-title">Ready to contribute?</h2>
            <p className="cta-band-text">50 labeled issues across smart contracts, backend, and frontend. Part of the Stellar Wave on Drips.</p>
            <a href={GITHUB_ISSUES} className="btn btn-primary btn-large" target="_blank" rel="noopener noreferrer">
              Browse issues on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="nav-logo-icon" aria-hidden="true">◇</span>
            <span>Trivela</span>
          </div>
          <div className="footer-links">
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">Repository</a>
            <a href={GITHUB_ISSUES} target="_blank" rel="noopener noreferrer">Issues</a>
            <a href={STELLAR_DOCS} target="_blank" rel="noopener noreferrer">Stellar</a>
            <a href={DRIP_WAVE} target="_blank" rel="noopener noreferrer">Drip Wave</a>
          </div>
          <p className="footer-legal">
            Part of the Stellar ecosystem. Apache-2.0.
          </p>
        </div>
      </footer>
    </div>
  );
}
