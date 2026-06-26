import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import DevNetworkSwitcher from './DevNetworkSwitcher';
import NotificationCenter from './NotificationCenter';

function truncateWalletAddress(walletAddress) {
  if (!walletAddress) return '';
  if (walletAddress.length <= 14) return walletAddress;
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

const NAV_LINKS = [
  { href: '/analytics', label: 'Analytics' },
  { href: '/notification-settings', label: 'Notifications' },
  { href: 'https://github.com/FinesseStudioLab/Trivela', label: 'GitHub' },
  { href: 'https://developers.stellar.org/docs', label: 'Stellar' },
  { href: '/', label: 'Campaigns' },
  { href: '/explore', label: 'Explore' },
  { href: '/about', label: 'About' },
  { href: '/admin', label: 'Admin' },
];

export default function Header({
  theme = 'dark',
  onToggleTheme,
  stellarNetwork = 'testnet',
  onChangeStellarNetwork,
  walletAddress = '',
  walletBalance = '',
  isWalletBalanceLoading = false,
  isWalletLoading = false,
  onConnectWallet,
  onDisconnectWallet,
}) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const balanceLabel = `${stellarNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'} balance`;
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <nav className="nav" aria-label="Primary">
        <div className="nav-top-row">
          <a href="/" className="nav-logo" aria-label="Trivela home" onClick={closeMenu}>
            <span className="nav-logo-icon" aria-hidden="true">
              ◇
            </span>
            Trivela
          </a>

          <button
            type="button"
            className="nav-hamburger"
            onClick={toggleMenu}
            aria-expanded={menuOpen}
            aria-controls="nav-mobile-menu"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            <span className="nav-hamburger-bar" aria-hidden="true" />
            <span className="nav-hamburger-bar" aria-hidden="true" />
            <span className="nav-hamburger-bar" aria-hidden="true" />
          </button>
        </div>

        <div
          id="nav-mobile-menu"
          className={`nav-actions${menuOpen ? ' nav-actions--open' : ''}`}
        >
          <div className="nav-links">
            {NAV_LINKS.map((link) => {
              const isExternal = link.href.startsWith('http');
              return (
                <a
                  key={link.href}
                  href={link.href}
                  {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {link.label}
                </a>
              );
            })}
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={pathname === link.href ? 'nav-link-active' : undefined}
                aria-current={pathname === link.href ? 'page' : undefined}
                onClick={closeMenu}
              >
                {link.label}
              </a>
            ))}
            {walletAddress && (
              <a
                href="/history"
                className={pathname === '/history' ? 'nav-link-active' : undefined}
                aria-current={pathname === '/history' ? 'page' : undefined}
                onClick={closeMenu}
              >
                History
              </a>
            )}
          </div>

          <div className="nav-utilities">
            <NotificationCenter />
            <DevNetworkSwitcher network={stellarNetwork} onChange={onChangeStellarNetwork} />

            {walletAddress && (
              <p className="nav-wallet" aria-live="polite">
                <span className="nav-wallet-label">Wallet</span>
                <span className="nav-wallet-value">{truncateWalletAddress(walletAddress)}</span>
              </p>
            )}

            {walletAddress && (
              <p className="nav-wallet nav-wallet-balance" aria-live="polite">
                <span className="nav-wallet-label">{balanceLabel}</span>
                <span className="nav-wallet-value">
                  {isWalletBalanceLoading ? 'Loading…' : walletBalance || '0 XLM'}
                </span>
              </p>
            )}

            {onConnectWallet && (
              <button
                type="button"
                className="btn btn-primary btn-button wallet-toggle"
                onClick={walletAddress ? onDisconnectWallet : onConnectWallet}
                disabled={isWalletLoading}
                aria-label={walletAddress ? 'Disconnect wallet' : 'Connect wallet'}
              >
                {isWalletLoading ? 'Connecting…' : walletAddress ? 'Disconnect' : 'Connect wallet'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-button theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${nextTheme} theme`}
            >
              <span className="theme-toggle-label">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
              <span className="theme-toggle-state" aria-hidden="true">
                {theme}
              </span>
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
