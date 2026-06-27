import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Landing from './Landing';
import CampaignDetail from './CampaignDetail';
import AdminCampaigns from './AdminCampaigns';
import About from './About';
import CampaignAnalytics from './CampaignAnalytics';
import NotificationSettings from './NotificationSettings';
import CreateCampaign from './CreateCampaign';
import PageMeta from './components/PageMeta';
import WalletModal from './components/WalletModal';
import RequireAdmin from './components/RequireAdmin';

// Route-level lazy loading — each chunk is fetched only when the user
// navigates to that route, keeping the initial bundle small.
const Explore = lazy(() => import('./Explore'));
const CampaignDetail = lazy(() => import('./CampaignDetail'));
const CampaignLeaderboard = lazy(() => import('./CampaignLeaderboard'));
const CampaignAnalytics = lazy(() => import('./CampaignAnalytics'));
const AdminCampaigns = lazy(() => import('./AdminCampaigns'));
const About = lazy(() => import('./About'));
const TransactionHistory = lazy(() => import('./TransactionHistory'));
const EmbedCampaign = lazy(() => import('./pages/EmbedCampaign'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
import { applyTheme, getPreferredTheme, THEME_STORAGE_KEY } from './theme';
import { getRuntimeConfig, initializeRuntimeConfig, setRuntimeStellarNetwork } from './config';
import {
  connectWallet as connectWalletProvider,
  fetchWalletBalance,
  formatWalletBalance,
  fetchRewardsBalance,
  formatPoints,
  normalizeError,
} from './stellar';
import { logSafeEvent } from './lib/safeAnalytics';

export default function App() {
  const [theme, setTheme] = useState(() => getPreferredTheme());
  const [runtimeConfig, setRuntimeConfig] = useState(() => getRuntimeConfig());
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBalance, setWalletBalance] = useState('');
  const [rewardsPoints, setRewardsPoints] = useState('');
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [isWalletBalanceLoading, setIsWalletBalanceLoading] = useState(false);
  const [isRewardsPointsLoading, setIsRewardsPointsLoading] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const { showHelpModal, setShowHelpModal, announcement } = useKeyboardShortcuts(true);

  useEffect(() => {
    applyTheme(theme);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    initializeRuntimeConfig()
      .then((nextConfig) => {
        if (!cancelled) {
          setRuntimeConfig(nextConfig);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeConfig(getRuntimeConfig());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  const loadWalletBalance = async (address) => {
    if (!address) {
      setWalletBalance('');
      setRewardsPoints('');
      return;
    }

    setIsWalletBalanceLoading(true);
    setIsRewardsPointsLoading(true);

    try {
      const balance = await fetchWalletBalance(address);
      setWalletBalance(formatWalletBalance(balance));
    } catch (_error) {
      setWalletBalance('Unavailable');
    } finally {
      setIsWalletBalanceLoading(false);
    }

    try {
      const points = await fetchRewardsBalance(address);
      setRewardsPoints(formatPoints(points));
    } catch (error) {
      console.error('Failed to load rewards points:', error);
      setRewardsPoints('Unavailable');
    } finally {
      setIsRewardsPointsLoading(false);
    }
  };

  const openWalletModal = () => {
    setWalletError('');
    setShowWalletModal(true);
  };

  const handleWalletSelect = async (providerName) => {
    setShowWalletModal(false);
    setIsWalletLoading(true);
    setWalletError('');

    try {
      const { address } = await connectWalletProvider(providerName);
      setWalletAddress(address);
      logSafeEvent('wallet_connected', { provider: providerName });
      await loadWalletBalance(address);
    } catch (error) {
      setWalletAddress('');
      setWalletBalance('');
      const msg = normalizeError(error);
      setWalletError(msg);
      setShowWalletModal(true);
    } finally {
      setIsWalletLoading(false);
    }
  };

  const disconnectWallet = () => {
    logSafeEvent('wallet_disconnected');
    setWalletAddress('');
    setWalletBalance('');
    setRewardsPoints('');
    setWalletError('');
  };

  const handleChangeStellarNetwork = async (nextNetwork) => {
    const nextConfig = setRuntimeStellarNetwork(nextNetwork);
    setRuntimeConfig(nextConfig);
    logSafeEvent('stellar_network_switched', { network: nextConfig.stellar.network });

    if (walletAddress) {
      try {
        await loadWalletBalance(walletAddress);
      } catch (_error) {
        // Keep existing wallet UI; individual sections will show errors as needed.
      }
    }
  };

  const location = useLocation();
  const navigate = useNavigate();
  const defaultPath = location.pathname || '/';

  return (
    <>
      <PageMeta path={defaultPath} />
      <Suspense
        fallback={
          <div className="route-loading" aria-live="polite">
            Loading…
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <Landing
                runtimeConfig={runtimeConfig}
                theme={theme}
                onToggleTheme={toggleTheme}
                stellarNetwork={runtimeConfig.stellar.network}
                onChangeStellarNetwork={handleChangeStellarNetwork}
                walletAddress={walletAddress}
                walletBalance={walletBalance}
                rewardsPoints={rewardsPoints}
                isWalletLoading={isWalletLoading}
                isWalletBalanceLoading={isWalletBalanceLoading}
                isRewardsPointsLoading={isRewardsPointsLoading}
                walletError={walletError}
                onConnectWallet={openWalletModal}
                onDisconnectWallet={disconnectWallet}
                onRefreshPoints={() => loadWalletBalance(walletAddress)}
              />
            }
          />
          <Route
            path="/explore"
            element={
              <Explore
                theme={theme}
                onToggleTheme={toggleTheme}
                stellarNetwork={runtimeConfig.stellar.network}
                onChangeStellarNetwork={handleChangeStellarNetwork}
                walletAddress={walletAddress}
                walletBalance={walletBalance}
                isWalletLoading={isWalletLoading}
                isWalletBalanceLoading={isWalletBalanceLoading}
                onConnectWallet={openWalletModal}
                onDisconnectWallet={disconnectWallet}
              />
            }
          />
          <Route
            path="/campaign/:id"
            element={
              <CampaignDetail
                theme={theme}
                onToggleTheme={toggleTheme}
                stellarNetwork={runtimeConfig.stellar.network}
                onChangeStellarNetwork={handleChangeStellarNetwork}
                walletAddress={walletAddress}
                walletBalance={walletBalance}
                rewardsPoints={rewardsPoints}
                isWalletLoading={isWalletLoading}
                isWalletBalanceLoading={isWalletBalanceLoading}
                isRewardsPointsLoading={isRewardsPointsLoading}
                onConnectWallet={openWalletModal}
                onDisconnectWallet={disconnectWallet}
                onRefreshPoints={() => loadWalletBalance(walletAddress)}
              />
            }
          />
          <Route
            path="/campaign/:id/leaderboard"
            element={
              <CampaignLeaderboard
                theme={theme}
                onToggleTheme={toggleTheme}
                stellarNetwork={runtimeConfig.stellar.network}
                onChangeStellarNetwork={handleChangeStellarNetwork}
                walletAddress={walletAddress}
                walletBalance={walletBalance}
                rewardsPoints={rewardsPoints}
                isWalletLoading={isWalletLoading}
                isWalletBalanceLoading={isWalletBalanceLoading}
                isRewardsPointsLoading={isRewardsPointsLoading}
                onConnectWallet={openWalletModal}
                onDisconnectWallet={disconnectWallet}
                onRefreshPoints={() => loadWalletBalance(walletAddress)}
              />
            }
          />
          <Route
            path="/admin/campaigns/:id/analytics"
            element={
              <RequireAdmin
                walletAddress={walletAddress}
                onConnectWallet={openWalletModal}
                isWalletLoading={isWalletLoading}
              >
                <CampaignAnalytics
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  stellarNetwork={runtimeConfig.stellar.network}
                  onChangeStellarNetwork={handleChangeStellarNetwork}
                  walletAddress={walletAddress}
                  walletBalance={walletBalance}
                  isWalletLoading={isWalletLoading}
                  isWalletBalanceLoading={isWalletBalanceLoading}
                  onConnectWallet={openWalletModal}
                  onDisconnectWallet={disconnectWallet}
                />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin
                walletAddress={walletAddress}
                onConnectWallet={openWalletModal}
                isWalletLoading={isWalletLoading}
              >
                <AdminCampaigns
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  stellarNetwork={runtimeConfig.stellar.network}
                  onChangeStellarNetwork={handleChangeStellarNetwork}
                  walletAddress={walletAddress}
                  walletBalance={walletBalance}
                  isWalletLoading={isWalletLoading}
                  isWalletBalanceLoading={isWalletBalanceLoading}
                  onConnectWallet={openWalletModal}
                  onDisconnectWallet={disconnectWallet}
                />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/campaigns/new"
            element={
              <RequireAdmin
                walletAddress={walletAddress}
                onConnectWallet={openWalletModal}
                isWalletLoading={isWalletLoading}
              >
                <CreateCampaign
                  standalone
                  campaigns={[]}
                  onCampaignCreated={(c) => navigate(`/campaign/${c.id}`)}
                />
              </RequireAdmin>
            }
          />
          <Route
            path="/about"
            element={
              <About
                theme={theme}
                onToggleTheme={toggleTheme}
                stellarNetwork={runtimeConfig.stellar.network}
                onChangeStellarNetwork={handleChangeStellarNetwork}
                walletAddress={walletAddress}
                walletBalance={walletBalance}
                isWalletLoading={isWalletLoading}
                isWalletBalanceLoading={isWalletBalanceLoading}
                onConnectWallet={openWalletModal}
                onDisconnectWallet={disconnectWallet}
              />
            }
          />
          <Route
            path="/history"
            element={
              <TransactionHistory
                theme={theme}
                onToggleTheme={toggleTheme}
                stellarNetwork={runtimeConfig.stellar.network}
                onChangeStellarNetwork={handleChangeStellarNetwork}
                walletAddress={walletAddress}
                walletBalance={walletBalance}
                isWalletLoading={isWalletLoading}
                isWalletBalanceLoading={isWalletBalanceLoading}
                onConnectWallet={openWalletModal}
                onDisconnectWallet={disconnectWallet}
              />
            }
          />
          <Route path="/embed/campaign/:id" element={<EmbedCampaign />} />
          <Route path="/u/:address" element={<PublicProfile />} />
        </Routes>
      </Suspense>
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={handleWalletSelect}
        isLoading={isWalletLoading}
        error={walletError}
      />
      <Route
        path="/analytics"
        element={
          <CampaignAnalytics
            theme={theme}
            onToggleTheme={toggleTheme}
            stellarNetwork={runtimeConfig.stellar.network}
            onChangeStellarNetwork={handleChangeStellarNetwork}
            walletAddress={walletAddress}
            walletBalance={walletBalance}
            isWalletLoading={isWalletLoading}
            isWalletBalanceLoading={isWalletBalanceLoading}
            onConnectWallet={connectWallet}
            onDisconnectWallet={disconnectWallet}
          />
        }
      />
      <Route
        path="/notification-settings"
        element={
          <NotificationSettings
            theme={theme}
            onToggleTheme={toggleTheme}
            stellarNetwork={runtimeConfig.stellar.network}
            onChangeStellarNetwork={handleChangeStellarNetwork}
            walletAddress={walletAddress}
            walletBalance={walletBalance}
            isWalletLoading={isWalletLoading}
            isWalletBalanceLoading={isWalletBalanceLoading}
            onConnectWallet={connectWallet}
            onDisconnectWallet={disconnectWallet}
          />
        }
      />
    </Routes>
      <div className="sr-only" aria-live="assertive" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        {announcement}
      </div>
      {showHelpModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-modal-title"
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
          onClick={() => setShowHelpModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface, #1e293b)',
              padding: '24px',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #334155)',
              width: '100%',
              maxWidth: '450px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="shortcuts-modal-title" style={{ margin: '0 0 16px', fontSize: '1.25rem' }}>Keyboard Shortcuts</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', textAlign: 'left', lineHeight: '2' }}>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>/</kbd> : Focus search bar</li>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>n</kbd> : New campaign</li>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>g</kbd> then <kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>h</kbd> : Go home</li>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>g</kbd> then <kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>p</kbd> : Go to profile</li>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>g</kbd> then <kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>a</kbd> : Go to admin dashboard</li>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>Esc</kbd> : Close open modals</li>
              <li><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>?</kbd> : Open this help menu</li>
            </ul>
            <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowHelpModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
