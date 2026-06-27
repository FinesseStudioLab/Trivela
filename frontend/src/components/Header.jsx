import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import DevNetworkSwitcher from './DevNetworkSwitcher';
import NotificationCenter from './NotificationCenter';
import { apiUrl } from '../config';

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

  const [latency, setLatency] = useState(null);
  const [statusColor, setStatusColor] = useState('red');
  const [showPanel, setShowPanel] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState(() => {
    try {
      const stored = localStorage.getItem('rpc_latency_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const checkHealth = async () => {
      const startTime = Date.now();
      try {
        const res = await fetch(apiUrl('/health/rpc'));
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (res.ok) {
          setLatency(duration);
          let color = 'green';
          if (duration >= 2000) {
            color = 'red';
          } else if (duration >= 500) {
            color = 'yellow';
          }
          setStatusColor(color);
          
          setLatencyHistory(prev => {
            const next = [...prev.slice(-4), duration];
            localStorage.setItem('rpc_latency_history', JSON.stringify(next));
            return next;
          });
        } else {
          setLatency(null);
          setStatusColor('red');
          setLatencyHistory(prev => {
            const next = [...prev.slice(-4), 0];
            localStorage.setItem('rpc_latency_history', JSON.stringify(next));
            return next;
          });
        }
      } catch (err) {
        setLatency(null);
        setStatusColor('red');
        setLatencyHistory(prev => {
          const next = [...prev.slice(-4), 0];
          localStorage.setItem('rpc_latency_history', JSON.stringify(next));
          return next;
        });
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [stellarNetwork]);

  const rpcUrl = stellarNetwork === 'mainnet' ? 'https://soroban-mainnet.stellar.org' : 'https://soroban-testnet.stellar.org';
  const tooltipText = latency !== null ? `RPC Latency: ${latency}ms — ${stellarNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'}` : `RPC Offline — ${stellarNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'}`;

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowPanel(!showPanel)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title={tooltipText}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: statusColor === 'green' ? '#10b981' : statusColor === 'yellow' ? '#f59e0b' : '#ef4444',
                    display: 'inline-block',
                  }}
                />
                {latency !== null && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    {latency}ms
                  </span>
                )}
              </button>

              {showPanel && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '16px',
                    zIndex: 100,
                    width: '260px',
                    textAlign: 'left',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>Soroban RPC Status</h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)', wordBreak: 'break-all' }}>
                    <strong>URL:</strong> {rpcUrl}
                  </p>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>Latency Sparkline (last 5):</p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '30px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px' }}>
                      {latencyHistory.map((h, i) => {
                        const maxVal = Math.max(...latencyHistory, 500);
                        const heightPct = h > 0 ? (h / maxVal) * 100 : 5;
                        const barColor = h === 0 ? '#ef4444' : h < 500 ? '#10b981' : h < 2000 ? '#f59e0b' : '#ef4444';
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              height: `${heightPct}%`,
                              backgroundColor: barColor,
                              borderRadius: '2px',
                            }}
                            title={h > 0 ? `${h}ms` : 'Failed/Error'}
                          />
                        );
                      })}
                    </div>
                  </div>
                  
                  <a
                    href="https://stellar.org/status"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'underline' }}
                  >
                    Stellar Network Status
                  </a>
                </div>
              )}
            </div>

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
                {isWalletLoading
                  ? 'Connecting…'
                  : walletAddress
                    ? 'Disconnect'
                    : statusColor === 'red'
                      ? 'Connect wallet (Network degraded)'
                      : 'Connect wallet'}
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
