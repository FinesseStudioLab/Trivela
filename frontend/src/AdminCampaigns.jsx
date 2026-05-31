import { useEffect, useState } from 'react';
import Header from './components/Header';
import CreateCampaign from './CreateCampaign';
import AdminControlPanel from './components/AdminControlPanel';
import AllowlistUpload from './components/AllowlistUpload';
import { apiClient } from './lib/apiClient';
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
  const [selectedCampaignId, setSelectedCampaignId] = useState('');

  const loadCampaigns = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiClient.getCampaigns();
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

          {/* #294 — Merkle allowlist generator. Computes the tree
              client-side; admin pastes the root into the on-chain
              setter and distributes the proofs JSON to participants. */}
          <AllowlistUpload />

          {campaigns.length > 0 && (
            <section className="section admin-control-section">
              <div className="admin-control-header">
                <h3 className="section-title">On-Chain Campaign Controls</h3>
                <p className="section-subtitle">
                  Manage campaign settings directly on the Stellar blockchain.
                </p>
              </div>

              <div className="campaign-selector">
                <label htmlFor="campaign-select" className="campaign-selector-label">
                  Select Campaign for On-Chain Management
                </label>
                <select
                  id="campaign-select"
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="campaign-selector-input"
                >
                  <option value="">Choose a campaign...</option>
                  {campaigns
                    .filter(campaign => campaign.contractId)
                    .map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.contractId})
                      </option>
                    ))}
                </select>
                {campaigns.filter(c => c.contractId).length === 0 && (
                  <small className="campaign-selector-hint">
                    No campaigns with contract IDs found. Create a campaign with a contract ID first.
                  </small>
                )}
              </div>

              {selectedCampaignId && (
                <AdminControlPanel 
                  contractId={campaigns.find(c => c.id === selectedCampaignId)?.contractId}
                />
              )}
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
