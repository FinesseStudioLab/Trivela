import { useEffect, useState } from 'react';
import Header from './components/Header';
import CreateCampaign from './CreateCampaign';
import { apiUrl } from './config';
import { logSafeEvent } from './lib/safeAnalytics';
import './Landing.css';

export default function AdminCampaigns({
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
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCampaigns = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/v1/campaigns'));
      if (!response.ok) {
        throw new Error(`Campaign API returned ${response.status}`);
      }
      const payload = await response.json();
      setCampaigns(payload.data || []);
      logSafeEvent('admin_campaigns_loaded', { count: payload.data?.length ?? 0 });
    } catch (fetchError) {
      setCampaigns([]);
      setError(fetchError?.message || 'Unable to load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

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
        <section className="section admin-section">
          <div className="admin-intro">
            <h2 className="section-title">Protected admin campaigns UI</h2>
            <p className="section-subtitle">
              Uses session-only API key storage and never exposes admin credentials on public pages.
            </p>
          </div>

          {loading ? (
            <p className="campaigns-status admin-loading" role="status">
              Loading campaigns...
            </p>
          ) : null}

          {!loading && error ? (
            <div className="detail-error admin-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={loadCampaigns}>
                Retry request
              </button>
            </div>
          ) : null}

          <CreateCampaign campaigns={campaigns} onCampaignCreated={loadCampaigns} />
        </section>
      </main>
    </div>
  );
}
