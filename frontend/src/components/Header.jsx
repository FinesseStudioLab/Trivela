import DevNetworkSwitcher from './DevNetworkSwitcher';

function truncateWalletAddress(walletAddress) {
  if (!walletAddress) return '';
  if (walletAddress.length <= 14) return walletAddress;
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

const NAV_LINKS = [
  { href: 'https://github.com/FinesseStudioLab/Trivela', label: 'GitHub' },
  { href: 'https://github.com/FinesseStudioLab/Trivela/issues', label: 'Contribute' },
  { href: 'https://developers.stellar.org/docs', label: 'Stellar' },
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

  return (
    <header className="site-header">
      <nav className="nav" aria-label="Primary">
        <a href="/" className="nav-logo" aria-label="Trivela home">
          <span className="nav-logo-icon" aria-hidden="true">
            ◇
          </span>
          Trivela
        </a>

        <div className="nav-actions">
          <div className="nav-links">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </div>

          <div className="nav-utilities">
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
