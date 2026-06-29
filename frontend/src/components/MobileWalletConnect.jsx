/**
 * MobileWalletConnect - Mobile wallet deep-link/WalletConnect flow
 * Handles mobile wallet connection via deep links with app-switch round trips and state restoration
 */

import { useState, useEffect, useRef } from 'react';

const MOBILE_WALLETS = [
  {
    name: 'Lobstr',
    deepLink: 'lobstr://',
    universalLink: 'https://lobstr.co',
    scheme: 'lobstr',
    installUrl: 'https://lobstr.co/download',
  },
  {
    name: 'Freighter',
    deepLink: 'freighter://',
    universalLink: 'https://www.freighter.app',
    scheme: 'freighter',
    installUrl: 'https://www.freighter.app',
  },
  {
    name: 'Rabet',
    deepLink: 'rabet://',
    universalLink: 'https://rabet.io',
    scheme: 'rabet',
    installUrl: 'https://rabet.io',
  },
  {
    name: 'xBull',
    deepLink: 'xbull://',
    universalLink: 'https://xbull.app',
    scheme: 'xbull',
    installUrl: 'https://xbull.app',
  },
];

const APP_STATE_KEY = 'trivela_mobile_wallet_state';
const CONNECTION_TIMEOUT = 120000; // 2 minutes

export default function MobileWalletConnect({ isOpen, onClose, onConnect, onSign }) {
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [connectionState, setConnectionState] = useState('idle'); // idle, connecting, waiting, success, error
  const [publicKey, setPublicKey] = useState(null);
  const [error, setError] = useState(null);
  const [showFallback, setShowFallback] = useState(false);
  const timeoutRef = useRef(null);
  const stateRef = useRef(null);

  useEffect(() => {
    // Check for return from wallet app
    const checkReturnState = () => {
      try {
        const savedState = localStorage.getItem(APP_STATE_KEY);
        if (savedState) {
          const state = JSON.parse(savedState);
          if (state.timestamp && Date.now() - state.timestamp < CONNECTION_TIMEOUT) {
            // User returned from wallet app
            handleWalletReturn(state);
          }
        }
      } catch (err) {
        console.error('Error checking return state:', err);
      }
    };

    if (isOpen) {
      checkReturnState();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen]);

  const handleWalletReturn = (state) => {
    localStorage.removeItem(APP_STATE_KEY);
    
    if (state.publicKey) {
      setPublicKey(state.publicKey);
      setConnectionState('success');
      onConnect?.(state.publicKey, state.walletName);
    } else if (state.error) {
      setError(state.error);
      setConnectionState('error');
    } else {
      setError('Connection cancelled or timed out');
      setConnectionState('error');
    }
  };

  const initiateConnection = (wallet) => {
    setSelectedWallet(wallet);
    setConnectionState('connecting');
    setError(null);

    // Generate a unique state ID for this connection attempt
    const stateId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Save state for return handling
    const connectionState = {
      stateId,
      walletName: wallet.name,
      timestamp: Date.now(),
      returnUrl: window.location.href,
    };
    
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(connectionState));
    stateRef.current = connectionState;

    // Construct deep link with connection parameters
    const deepLinkParams = new URLSearchParams({
      action: 'connect',
      state: stateId,
      returnUrl: window.location.href,
    });

    const deepLink = `${wallet.deepLink}?${deepLinkParams.toString()}`;
    
    // Attempt to open deep link
    const opened = openDeepLink(deepLink, wallet.universalLink);
    
    if (opened) {
      setConnectionState('waiting');
      
      // Set timeout for connection
      timeoutRef.current = setTimeout(() => {
        if (connectionState === 'waiting') {
          setConnectionState('error');
          setError('Connection timed out. Please try again.');
          localStorage.removeItem(APP_STATE_KEY);
        }
      }, CONNECTION_TIMEOUT);
    } else {
      setConnectionState('error');
      setError('Could not open wallet app');
      setShowFallback(true);
    }
  };

  const openDeepLink = (deepLink, universalLink) => {
    // Try deep link first
    try {
      const start = Date.now();
      window.location.href = deepLink;
      
      // If on iOS, the deep link might not work if app isn't installed
      // Use a timeout to detect if deep link failed
      setTimeout(() => {
        if (Date.now() - start < 2000) {
          // Deep link likely failed, try universal link
          window.location.href = universalLink;
        }
      }, 100);
      
      return true;
    } catch (err) {
      console.error('Error opening deep link:', err);
      return false;
    }
  };

  const initiateSign = async (transactionXdr) => {
    if (!selectedWallet || !publicKey) {
      setError('Please connect a wallet first');
      return;
    }

    setConnectionState('connecting');
    setError(null);

    const stateId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    const signState = {
      stateId,
      walletName: selectedWallet.name,
      timestamp: Date.now(),
      publicKey,
      transactionXdr,
      returnUrl: window.location.href,
    };
    
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(signState));

    const deepLinkParams = new URLSearchParams({
      action: 'sign',
      state: stateId,
      xdr: transactionXdr,
      returnUrl: window.location.href,
    });

    const deepLink = `${selectedWallet.deepLink}?${deepLinkParams.toString()}`;
    openDeepLink(deepLink, selectedWallet.universalLink);
    
    setConnectionState('waiting');
    
    timeoutRef.current = setTimeout(() => {
      setConnectionState('error');
      setError('Signing timed out');
      localStorage.removeItem(APP_STATE_KEY);
    }, CONNECTION_TIMEOUT);
  };

  const resetConnection = () => {
    setConnectionState('idle');
    setSelectedWallet(null);
    setPublicKey(null);
    setError(null);
    setShowFallback(false);
    localStorage.removeItem(APP_STATE_KEY);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (!isOpen) return null;

  if (!isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
          <h2 style={{ marginTop: 0 }}>Mobile Wallet Connection</h2>
          <p style={{ color: '#64748b', marginBottom: '16px' }}>
            This feature is designed for mobile devices. On desktop, please use a browser extension wallet like Freighter.
          </p>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', padding: '24px', borderRadius: '12px', maxWidth: '450px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Connect Mobile Wallet</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
          >
            ✕
          </button>
        </div>

        {connectionState === 'idle' && (
          <>
            <p style={{ color: '#64748b', marginBottom: '16px' }}>
              Select your mobile wallet to connect. You'll be redirected to the wallet app to approve the connection.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MOBILE_WALLETS.map(wallet => (
                <button
                  key={wallet.name}
                  onClick={() => initiateConnection(wallet)}
                  style={{
                    padding: '16px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#e0e7ff'}
                  onMouseLeave={(e) => e.target.style.background = '#f8fafc'}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{wallet.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Opens {wallet.name} app to connect
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {connectionState === 'connecting' && (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📱</div>
            <p style={{ color: '#64748b' }}>Opening {selectedWallet?.name}...</p>
          </div>
        )}

        {connectionState === 'waiting' && (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
            <p style={{ color: '#64748b', marginBottom: '8px' }}>
              Waiting for approval in {selectedWallet?.name}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Return to this app after approving in your wallet
            </p>
            <button
              onClick={resetConnection}
              style={{ marginTop: '16px', padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        {connectionState === 'success' && publicKey && (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>✅</div>
            <p style={{ color: '#166534', fontWeight: 600, marginBottom: '8px' }}>
              Wallet Connected!
            </p>
            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
            </div>
            <button
              onClick={() => {
                onClose();
                resetConnection();
              }}
              style={{ marginTop: '16px', padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Continue
            </button>
          </div>
        )}

        {connectionState === 'error' && (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>❌</div>
            <p style={{ color: '#991b1b', fontWeight: 600, marginBottom: '8px' }}>
              Connection Failed
            </p>
            <p style={{ color: '#64748b', marginBottom: '16px' }}>{error}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                onClick={resetConnection}
                style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Try Again
              </button>
              <button
                onClick={() => setShowFallback(true)}
                style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Install Wallet
              </button>
            </div>
          </div>
        )}

        {showFallback && selectedWallet && (
          <div style={{ marginTop: '16px', padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '1rem', margin: '0 0 8px 0' }}>Wallet Not Installed</h3>
            <p style={{ fontSize: '0.9rem', color: '#92400e', marginBottom: '12px' }}>
              {selectedWallet.name} doesn't appear to be installed on your device.
            </p>
            <a
              href={selectedWallet.installUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', padding: '8px 16px', background: '#f59e0b', color: 'white', textDecoration: 'none', borderRadius: '6px' }}
            >
              Install {selectedWallet.name}
            </a>
          </div>
        )}

        <div style={{ marginTop: '16px', padding: '12px', background: '#f1f5f9', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b' }}>
          <strong>How it works:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Tap your wallet to open its app</li>
            <li>Approve the connection in the wallet</li>
            <li>Return to this app automatically</li>
            <li>Your wallet is now connected!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
