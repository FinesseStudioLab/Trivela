import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SITE_URL } from './config';
import { apiClient } from './lib/apiClient';
import Header from './components/Header';
import CampaignCard from './components/CampaignCard';
import CampaignFilters, { sortKeyToApiParams } from './components/CampaignFilters';
import EmptyState from './components/EmptyState';
import PageMeta from './components/PageMeta';
import { logSafeEvent } from './lib/safeAnalytics';
import './Explore.css';

const CAMPAIGNS_PER_PAGE = 9;
const RAIL_LIMIT = 6;

const VALID_SORT_KEYS = new Set(['newest', 'oldest', 'name_asc', 'name_desc', 'reward_desc']);

function normalizeSortKey(raw) {
  return VALID_SORT_KEYS.has(raw) ? raw : 'newest';
}

function getFallbackPagination(items, page) {
  return {
    total: items.length,
    count: items.length,
    page,
    limit: CAMPAIGNS_PER_PAGE,
    totalPages: items.length > 0 ? 1 : 0,
    hasPreviousPage: page > 1,
    hasNextPage: false,
    previousPage: page > 1 ? page - 1 : null,
    nextPage: null,
  };
}

function CampaignRail({ title, campaigns, isLoading, emptyText }) {
  if (isLoading) {
    return (
      <div className="explore-rail">
        <h2 className="explore-rail-title">{title}</h2>
        <div className="explore-rail-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span className="sr-only">Loading…</span>
        </div>
      </div>
    );
  }

  if (!campaigns.length) return null;

  return (
    <div className="explore-rail">
      <h2 className="explore-rail-title">{title}</h2>
      <ul className="explore-rail-grid">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <CampaignCard campaign={campaign} />
          </li>
        ))}
      </ul>
      {emptyText && campaigns.length === 0 && <p className="explore-rail-empty">{emptyText}</p>}
    </div>
  );
}

export default function Explore({
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
  const [searchParams, setSearchParams] = useSearchParams();

  const initialPage = (() => {
    const raw = Number.parseInt(searchParams.get('page') ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  })();
  const initialQuery = searchParams.get('q') ?? '';
  const initialActiveOnly = searchParams.get('active') === 'true';
  const initialSortKey = normalizeSortKey(searchParams.get('sortKey') ?? 'newest');
  const initialCategory = searchParams.get('category') ?? '';

  const [campaigns, setCampaigns] = useState([]);
  const [campaignsError, setCampaignsError] = useState('');
  const [isCampaignsLoading, setIsCampaignsLoading] = useState(true);
  const [campaignPage, setCampaignPage] = useState(initialPage);
  const [campaignQuery, setCampaignQuery] = useState(initialQuery);
  const [activeOnly, setActiveOnly] = useState(initialActiveOnly);
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [category, setCategory] = useState(initialCategory);
  const [pagination, setPagination] = useState(() => getFallbackPagination([], initialPage));
  const [refreshKey, setRefreshKey] = useState(0);

  const [trendingCampaigns, setTrendingCampaigns] = useState([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(true);
  const [newCampaigns, setNewCampaigns] = useState([]);
  const [isNewLoading, setIsNewLoading] = useState(true);

  useEffect(() => {
    const next = new URLSearchParams();
    if (campaignQuery) next.set('q', campaignQuery);
    if (activeOnly) next.set('active', 'true');
    if (sortKey !== 'newest') next.set('sortKey', sortKey);
    if (campaignPage > 1) next.set('page', String(campaignPage));
    if (category) next.set('category', category);

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [campaignQuery, activeOnly, sortKey, campaignPage, category, searchParams, setSearchParams]);

  const sortParams = useMemo(() => sortKeyToApiParams(sortKey), [sortKey]);

  useEffect(() => {
    const controller = new AbortController();
    setIsCampaignsLoading(true);
    setCampaignsError('');

    apiClient
      .getCampaigns({
        page: campaignPage,
        limit: CAMPAIGNS_PER_PAGE,
        q: campaignQuery.trim() || undefined,
        active: activeOnly ? true : undefined,
        sort: sortParams.sort,
        order: sortParams.order,
        category: category || undefined,
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const items = Array.isArray(payload) ? payload : (payload.data ?? payload.campaigns ?? []);
        logSafeEvent('explore_campaigns_loaded', { count: items.length });
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
      .catch(() => {
        if (controller.signal.aborted) return;
        setCampaigns([]);
        setPagination(getFallbackPagination([], campaignPage));
        setCampaignsError('Unable to load campaigns right now.');
        logSafeEvent('explore_campaigns_failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsCampaignsLoading(false);
      });

    return () => controller.abort();
  }, [campaignPage, refreshKey, campaignQuery, activeOnly, sortParams, category]);

  useEffect(() => {
    setIsTrendingLoading(true);
    apiClient
      .getTrendingCampaigns({ limit: RAIL_LIMIT })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : (payload.data ?? []);
        setTrendingCampaigns(items);
      })
      .catch(() => setTrendingCampaigns([]))
      .finally(() => setIsTrendingLoading(false));
  }, []);

  useEffect(() => {
    setIsNewLoading(true);
    apiClient
      .getNewCampaigns({ limit: RAIL_LIMIT })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : (payload.data ?? payload.campaigns ?? []);
        setNewCampaigns(items);
      })
      .catch(() => setNewCampaigns([]))
      .finally(() => setIsNewLoading(false));
  }, []);

  const hasActiveFilters = Boolean(campaignQuery || activeOnly || sortKey !== 'newest' || category);
  const totalCampaigns = pagination?.total ?? campaigns.length;
  const featuredCampaigns = campaigns.filter((c) => c.featured);
  const otherCampaigns = campaigns.filter((c) => !c.featured);

  const exploreJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Explore Campaigns — Trivela',
    description:
      'Discover and join public Stellar Soroban campaigns. Earn on-chain rewards by participating in active campaigns.',
    url: `${SITE_URL}/explore`,
    publisher: {
      '@type': 'Organization',
      name: 'Trivela',
      url: SITE_URL,
    },
  };

  return (
    <div className="explore-page">
      <a className="skip-link" href="#explore-main">
        Skip to main content
      </a>
      <PageMeta
        title="Explore Campaigns — Trivela"
        description="Discover and join public Stellar Soroban campaigns. Earn on-chain rewards by participating in active campaigns on Trivela."
        path="/explore"
        type="website"
        jsonLd={exploreJsonLd}
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

      <main id="explore-main" className="explore-main" tabIndex="-1">
        <header className="explore-hero">
          <h1 className="explore-hero-title">Discover Campaigns</h1>
          <p className="explore-hero-subtitle">
            Find and join public Stellar Soroban campaigns. Earn on-chain rewards for every action
            you take.
          </p>
        </header>

        <CampaignRail
          title="Trending"
          campaigns={trendingCampaigns}
          isLoading={isTrendingLoading}
        />

        <CampaignRail title="New" campaigns={newCampaigns} isLoading={isNewLoading} />

        <section className="explore-section" aria-labelledby="explore-all-title">
          <div className="explore-section-header">
            <h2 id="explore-all-title" className="explore-section-title">
              All Campaigns
            </h2>
            {!isCampaignsLoading && !campaignsError && (
              <p className="explore-result-count" aria-live="polite">
                {totalCampaigns === 1 ? '1 campaign' : `${totalCampaigns} campaigns`}
                {hasActiveFilters ? ' matching your filters' : ''}
              </p>
            )}
          </div>

          <CampaignFilters
            query={campaignQuery}
            activeOnly={activeOnly}
            sortKey={sortKey}
            onQueryChange={(next) => {
              setCampaignPage(1);
              setCampaignQuery(next);
            }}
            onActiveOnlyChange={(next) => {
              setCampaignPage(1);
              setActiveOnly(next);
            }}
            onSortKeyChange={(next) => {
              setCampaignPage(1);
              setSortKey(normalizeSortKey(next));
            }}
          />

          {category && (
            <div className="explore-active-category">
              <span className="explore-category-tag">
                Category: <strong>{category}</strong>
              </span>
              <button
                type="button"
                className="explore-category-clear"
                onClick={() => {
                  setCategory('');
                  setCampaignPage(1);
                }}
              >
                ✕ Clear
              </button>
            </div>
          )}

          <div className="campaigns-panel" aria-busy={isCampaignsLoading}>
            {isCampaignsLoading ? (
              <div className="campaigns-loading" role="status">
                <span className="spinner" aria-hidden="true" />
                <p className="campaigns-loading-text">Loading campaigns…</p>
              </div>
            ) : campaignsError ? (
              <EmptyState
                eyebrow="Discovery"
                title="We couldn't load campaigns"
                description={campaignsError}
                actionLabel="Try again"
                onAction={() => setRefreshKey((k) => k + 1)}
              />
            ) : campaigns.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  eyebrow="Discovery"
                  title="No campaigns found"
                  description="No campaigns match the current filters. Try clearing them or broadening your search."
                  actionLabel="Clear filters"
                  onAction={() => {
                    setCampaignQuery('');
                    setActiveOnly(false);
                    setSortKey('newest');
                    setCategory('');
                    setCampaignPage(1);
                  }}
                />
              ) : (
                <EmptyState
                  eyebrow="Discovery"
                  title="No campaigns yet"
                  description="No public campaigns are available right now. Check back soon!"
                />
              )
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
                {otherCampaigns.length > 0 && (
                  <>
                    <h3
                      className={featuredCampaigns.length > 0 ? 'all-campaigns-title' : 'sr-only'}
                    >
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
              </>
            )}
          </div>

          {!isCampaignsLoading && !campaignsError && pagination.totalPages > 1 && (
            <nav className="campaign-pagination" aria-label="Campaign pages">
              <button
                type="button"
                className="btn btn-secondary btn-button"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setCampaignPage((p) => Math.max(p - 1, 1))}
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
                onClick={() => setCampaignPage((p) => p + 1)}
              >
                Next page
              </button>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}
