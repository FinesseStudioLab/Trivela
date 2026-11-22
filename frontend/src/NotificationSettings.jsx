import { useState } from 'react';
import Header from './components/Header';
import NotificationPreferences from './components/NotificationPreferences';
import {
  isSuccessChimeEnabled,
  playSuccessChime,
  setSuccessChimeEnabled,
} from './lib/successChime';
import './Landing.css';

export default function NotificationSettings({
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
  const [chimeEnabled, setChimeEnabled] = useState(isSuccessChimeEnabled);

  const handleChimeToggle = (event) => {
    const enabled = event.target.checked;
    setSuccessChimeEnabled(enabled);
    setChimeEnabled(enabled);
    if (enabled) playSuccessChime({ force: true });
  };

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
        <section className="section" style={{ maxWidth: 820, margin: '0 auto' }}>
          <NotificationPreferences />
          <div style={{ marginTop: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={chimeEnabled}
                onChange={handleChimeToggle}
                data-testid="success-chime-toggle"
              />
              Play a subtle chime when a transaction succeeds
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}
