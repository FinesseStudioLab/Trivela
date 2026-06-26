/**
 * SignInWithStellar — SEP-10 authentication component.
 *
 * Guides the user through the challenge → sign → token flow so they
 * can authenticate with a Stellar wallet.  Stores the resulting JWT
 * in localStorage for subsequent authenticated API calls.
 *
 * Props:
 *   onSignIn(account, token) – called after successful authentication
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@stellar/stellar-sdk';
import { walletManager } from '../lib/wallet/index.js';
import { apiUrl } from '../config';

const BUTTON_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 20px',
  borderRadius: '10px',
  border: '1px solid rgba(99, 102, 241, 0.4)',
  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
  color: '#a5b4fc',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const LOADING_STYLE = {
  ...BUTTON_STYLE,
  opacity: 0.6,
  cursor: 'not-allowed',
};

const ERROR_STYLE = {
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '0.85rem',
  color: '#f87171',
  marginTop: '8px',
};

export default function SignInWithStellar({ onSignIn }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      // 1. Get wallet address
      const address = await walletManager.getAddress();
      if (!address) throw new Error('No wallet address available');

      // 2. Fetch challenge from backend
      const challengeUrl = `${apiUrl}/auth/sep10/challenge?account=${encodeURIComponent(address)}`;
      const challengeRes = await fetch(challengeUrl);
      if (!challengeRes.ok) {
        const body = await challengeRes.json().catch(() => ({}));
        throw new Error(body.error || `Challenge request failed (${challengeRes.status})`);
      }
      const { transaction: challengeXdr, network_passphrase } = await challengeRes.json();

      // 3. Sign the challenge with the connected wallet
      const signedXdr = await walletManager.signTransaction(challengeXdr, {
        networkPassphrase: network_passphrase,
      });

      // 4. Submit signed transaction for verification + JWT
      const tokenUrl = `${apiUrl}/auth/sep10/token`;
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr, account: address }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || `Token request failed (${tokenRes.status})`);
      }

      const { token, expires_in } = await tokenRes.json();

      // 5. Store token
      localStorage.setItem('trivela_auth_token', token);
      localStorage.setItem('trivela_auth_expires', String(Date.now() + expires_in * 1000));
      localStorage.setItem('trivela_auth_account', address);

      onSignIn?.(address, token);
    } catch (err) {
      setError(err?.message || 'Sign-in failed');
    } finally {
      setIsLoading(false);
    }
  }, [onSignIn]);

  return (
    <div>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={isLoading}
        style={isLoading ? LOADING_STYLE : BUTTON_STYLE}
        onMouseEnter={(e) => {
          if (!isLoading) {
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.7)';
            e.currentTarget.style.background =
              'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.25))';
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
            e.currentTarget.style.background =
              'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))';
          }
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>🔐</span>
        {isLoading ? 'Authenticating…' : 'Sign in with Stellar'}
      </button>
      {error && <div style={ERROR_STYLE}>{error}</div>}
    </div>
  );
}

/**
 * Helper: get the stored auth token if valid.
 * @returns {{ token: string, account: string } | null}
 */
export function getStoredAuth() {
  const token = localStorage.getItem('trivela_auth_token');
  const expires = localStorage.getItem('trivela_auth_expires');
  const account = localStorage.getItem('trivela_auth_account');

  if (!token || !expires || !account) return null;
  if (Date.now() > Number(expires)) {
    localStorage.removeItem('trivela_auth_token');
    localStorage.removeItem('trivela_auth_expires');
    localStorage.removeItem('trivela_auth_account');
    return null;
  }

  return { token, account };
}

/**
 * Helper: clear stored auth.
 */
export function clearStoredAuth() {
  localStorage.removeItem('trivela_auth_token');
  localStorage.removeItem('trivela_auth_expires');
  localStorage.removeItem('trivela_auth_account');
}
