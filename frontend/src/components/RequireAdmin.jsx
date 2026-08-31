import { getAdminAddresses } from '../config.js';

const PAGE_STYLE = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-bg, #0f172a)',
  padding: '24px',
};

const CARD_STYLE = {
  background: 'var(--color-surface, #1e293b)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: '16px',
  padding: '40px 36px',
  maxWidth: '420px',
  width: '100%',
  textAlign: 'center',
};

export default function RequireAdmin({
  walletAddress,
  onConnectWallet,
  isWalletLoading,
  children,
}) {
  const adminAddresses = getAdminAddresses();

  if (!walletAddress) {
    return (
      <div style={PAGE_STYLE}>
        <div style={CARD_STYLE}>
          <p style={{ fontSize: '2rem', marginBottom: '16px' }}>🔐</p>
          <h1
            style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              marginBottom: '12px',
              color: 'var(--color-text, #e2e8f0)',
            }}
          >
            Admin access required
          </h1>
          <p
            style={{
              color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              marginBottom: '24px',
            }}
          >
            Connect your authorized wallet to access the admin panel.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConnectWallet}
            disabled={isWalletLoading}
          >
            {isWalletLoading ? 'Connecting…' : 'Connect wallet'}
          </button>
        </div>
      </div>
    );
  }

  if (adminAddresses.length > 0 && !adminAddresses.includes(walletAddress)) {
    return (
      <div style={PAGE_STYLE}>
        <div style={CARD_STYLE}>
          <p style={{ fontSize: '2rem', marginBottom: '16px' }}>⛔</p>
          <h1
            style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              marginBottom: '12px',
              color: 'var(--color-text, #e2e8f0)',
            }}
          >
            Access denied
          </h1>
          <p
            style={{
              color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              marginBottom: '16px',
            }}
          >
            This page is restricted to authorized administrators. Your connected address is not on
            the admin list.
          </p>
          <code
            style={{
              display: 'block',
              background: 'var(--color-bg, #0f172a)',
              border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '0.75rem',
              color: '#94a3b8',
              wordBreak: 'break-all',
              marginBottom: '20px',
            }}
          >
            {walletAddress}
          </code>
          <a href="/" className="btn btn-secondary">
            Back to campaigns
          </a>
        </div>
      </div>
    );
  }

  return children;
}
