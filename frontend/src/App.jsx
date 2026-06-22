import { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Landing from './Landing';
import CampaignDetail from './CampaignDetail';
import CampaignLeaderboard from './CampaignLeaderboard';
import CampaignAnalytics from './CampaignAnalytics';
import AdminCampaigns from './AdminCampaigns';
import About from './About';
import PageMeta from './components/PageMeta';
import TransactionHistory from './TransactionHistory';
import EmbedCampaign from './pages/EmbedCampaign';
import WalletModal from './components/WalletModal';
import RequireAdmin from './components/RequireAdmin';
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
  const defaultPath = location.pathname || '/';

  return (
    <>
      <PageMeta path={defaultPath} />
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
      </Routes>
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={handleWalletSelect}
        isLoading={isWalletLoading}
        error={walletError}
      />
    </>
  );
}
