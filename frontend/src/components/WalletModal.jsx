import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

const WALLET_DEFS = [
  {
    name: 'Freighter',
    descKey: 'wallet.freighter.desc',
    icon: '✦',
    installUrl: 'https://www.freighter.app',
    detected: () => !!window.freighterApi,
    comingSoon: false,
  },
  {
    name: 'xBull',
    descKey: 'wallet.xbull.desc',
    icon: '⊕',
    installUrl: 'https://xbull.app',
    detected: () => !!window.xBullSDK,
    comingSoon: false,
  },
  {
    name: 'Lobstr',
    descKey: 'wallet.lobstr.desc',
    icon: '◎',
    installUrl: 'https://lobstr.co/download',
    detected: () => !!(window.lobstr ?? window.lobstrApi),
    comingSoon: false,
  },
  {
    name: 'WalletConnect',
    descKey: 'wallet.walletconnect.desc',
    icon: '⬡',
    installUrl: 'https://walletconnect.com/explorer',
    detected: () => !!window.__walletConnectClient,
    comingSoon: false,
  },
  {
    name: 'Rabet',
    descKey: 'wallet.rabet.desc',
    icon: '◈',
    installUrl: 'https://rabet.io',
    detected: () => !!window.rabet,
    comingSoon: false,
  },
];

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
};

const DIALOG_STYLE = {
  background: 'var(--color-surface, #1e293b)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  borderRadius: '16px',
  padding: '28px',
  width: '100%',
  maxWidth: '420px',
};

const ERROR_STYLE = {
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  marginBottom: '16px',
  fontSize: '0.85rem',
  color: '#f87171',
};

function WalletOption({ wallet, isDetected, isLoading, onConnect }) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const disabled = isLoading || wallet.comingSoon;

  const badgeStyle = {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
    ...(isDetected
      ? { color: '#4ade80', background: 'rgba(74,222,128,0.1)' }
      : wallet.comingSoon
        ? { color: '#94a3b8', background: 'rgba(148,163,184,0.1)' }
        : { color: '#94a3b8', background: 'rgba(148,163,184,0.1)' }),
  };

  const rowStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    borderRadius: '10px',
    textAlign: 'left',
    textDecoration: 'none',
    transition: 'border-color 0.15s',
    border: `1px solid ${hovered && isDetected && !disabled ? 'var(--color-accent, #6366f1)' : 'var(--color-border, rgba(255,255,255,0.08))'}`,
    background: isDetected ? 'var(--color-bg, #0f172a)' : 'transparent',
    opacity: disabled ? 0.6 : 1,
    cursor: isDetected && !disabled ? 'pointer' : 'default',
  };

  const inner = (
    <>
      <span style={{ fontSize: '1.4rem', width: '28px', textAlign: 'center' }}>{wallet.icon}</span>
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            margin: 0,
            color: 'var(--color-text, #e2e8f0)',
          }}
        >
          {wallet.name}
        </p>
        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--color-text-secondary, #94a3b8)',
            margin: '2px 0 0',
          }}
        >
          {wallet.comingSoon ? t('wallet.modal.comingSoon') : wallet.description}
        </p>
      </div>
      <span style={badgeStyle}>
        {isDetected
          ? isLoading
            ? t('wallet.connecting')
            : t('wallet.modal.detected')
          : wallet.comingSoon
            ? t('wallet.modal.soon')
            : t('wallet.modal.install')}
      </span>
    </>
  );

  if (isDetected) {
    return (
      <button
        type="button"
        onClick={() => onConnect(wallet.name)}
        disabled={disabled}
        style={rowStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {inner}
      </button>
    );
  }

  if (wallet.comingSoon) {
    return <div style={rowStyle}>{inner}</div>;
  }

  return (
    <a
      href={wallet.installUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {inner}
    </a>
  );
}

export default function WalletModal({ isOpen, onClose, onConnect, isLoading, error }) {
  const { t } = useI18n();
  const WALLETS = WALLET_DEFS.map((w) => ({ ...w, description: t(w.descKey) }));
  const [detected, setDetected] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const map = {};
    for (const w of WALLETS) {
      try {
        map[w.name] = w.detected();
      } catch {
        map[w.name] = false;
      }
    }
    setDetected(map);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={OVERLAY_STYLE}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('wallet.modal.title')}
    >
      <div style={DIALOG_STYLE} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text, #e2e8f0)',
            }}
          >
            {t('wallet.modal.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              color: 'var(--color-text-secondary, #94a3b8)',
              padding: '4px 8px',
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && <div style={ERROR_STYLE}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {WALLETS.map((wallet) => (
            <WalletOption
              key={wallet.name}
              wallet={wallet}
              isDetected={!!detected[wallet.name]}
              isLoading={isLoading}
              onConnect={onConnect}
            />
          ))}
        </div>

        <p
          style={{
            marginTop: '16px',
            fontSize: '0.78rem',
            color: 'var(--color-text-secondary, #64748b)',
            textAlign: 'center',
          }}
        >
          New to Stellar?{' '}
          <a
            href="https://www.freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent, #6366f1)', textDecoration: 'none' }}
          >
            Freighter
          </a>{' '}
          or{' '}
          <a
            href="https://lobstr.co/download"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent, #6366f1)', textDecoration: 'none' }}
          >
            Lobstr
          </a>{' '}
          are great places to start.
        </p>
      </div>
    </div>
  );
}
