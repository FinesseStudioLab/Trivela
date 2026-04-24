import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './Landing';
import CampaignDetail from './CampaignDetail';
import AdminCampaigns from './AdminCampaigns';
import { applyTheme, getPreferredTheme, THEME_STORAGE_KEY } from './theme';
import {
  getWalletAddress,
  fetchWalletBalance,
  formatWalletBalance,
  fetchRewardsBalance,
  formatPoints,
  normalizeError,
} from './stellar';
import { logSafeEvent } from './lib/safeAnalytics';

export default function App() {
  const [theme, setTheme] = useState(() => getPreferredTheme());
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBalance, setWalletBalance] = useState('');
  const [rewardsPoints, setRewardsPoints] = useState('');
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [isWalletBalanceLoading, setIsWalletBalanceLoading] = useState(false);
  const [isRewardsPointsLoading, setIsRewardsPointsLoading] = useState(false);
  const [walletError, setWalletError] = useState('');

  useEffect(() => {
    applyTheme(theme);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

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

    // 1. Load native XLM balance (Horizon)
    try {
      const balance = await fetchWalletBalance(address);
      setWalletBalance(formatWalletBalance(balance));
    } catch (_error) {
      setWalletBalance('Unavailable');
    } finally {
      setIsWalletBalanceLoading(false);
    }

    // 2. Load rewards points (Soroban RPC)
    try {
      const points = await fetchRewardsBalance(address);
      setRewardsPoints(formatPoints(points));
    } catch (error) {
      console.error('Failed to load rewards points:', error);
      // We rely on normalizeError in components if they want more detail,
      // but here we just mark it as unavailable for the global state.
      setRewardsPoints('Unavailable');
    } finally {
      setIsRewardsPointsLoading(false);
    }
  };

  const connectWallet = async () => {
    setIsWalletLoading(true);
    setWalletError('');

    try {
      const address = await getWalletAddress();
      setWalletAddress(address);
      logSafeEvent('wallet_connected');
      await loadWalletBalance(address);
    } catch (error) {
      setWalletAddress('');
      setWalletBalance('');
      setWalletError(normalizeError(error));
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

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Landing
            theme={theme}
            onToggleTheme={toggleTheme}
            walletAddress={walletAddress}
            walletBalance={walletBalance}
            rewardsPoints={rewardsPoints}
            isWalletLoading={isWalletLoading}
            isWalletBalanceLoading={isWalletBalanceLoading}
            isRewardsPointsLoading={isRewardsPointsLoading}
            walletError={walletError}
            onConnectWallet={connectWallet}
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
            walletAddress={walletAddress}
            walletBalance={walletBalance}
            rewardsPoints={rewardsPoints}
            isWalletLoading={isWalletLoading}
            isWalletBalanceLoading={isWalletBalanceLoading}
            isRewardsPointsLoading={isRewardsPointsLoading}
            onConnectWallet={connectWallet}
            onDisconnectWallet={disconnectWallet}
            onRefreshPoints={() => loadWalletBalance(walletAddress)}
          />
        }
      />
      <Route
        path="/admin"
        element={
          <AdminCampaigns
            theme={theme}
            onToggleTheme={toggleTheme}
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
  );
}
