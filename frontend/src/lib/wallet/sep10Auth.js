import { useState, useCallback } from 'react';
import { apiUrl } from '../config';

/**
 * useSep10Auth — React hook for SEP-10 Stellar wallet authentication.
 *
 * Manages the full challenge → sign → token flow and stores the JWT.
 */
export function useSep10Auth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('trivela_wallet_token') || null;
    } catch {
      return null;
    }
  });
  const [account, setAccount] = useState(() => {
    try {
      return localStorage.getItem('trivela_wallet_account') || null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(null);

  const signIn = useCallback(async (walletAddress, signTransaction) => {
    if (!walletAddress || !signTransaction) {
      setError(new Error('Wallet address and signTransaction function required'));
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const challengeRes = await fetch(
        `${apiUrl()}/auth/sep10/challenge?account=${encodeURIComponent(walletAddress)}`,
      );

      if (!challengeRes.ok) {
        const body = await challengeRes.json().catch(() => ({}));
        throw new Error(body.error || `Challenge request failed: ${challengeRes.status}`);
      }

      const { transaction: challengeXdr, networkPassphrase } = await challengeRes.json();

      const signedXdr = await signTransaction(challengeXdr, {
        networkPassphrase,
        address: walletAddress,
      });

      const tokenRes = await fetch(`${apiUrl()}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: typeof signedXdr === 'string' ? signedXdr : signedXdr.signedTxXdr,
          account: walletAddress,
        }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || `Token request failed: ${tokenRes.status}`);
      }

      const { token: jwt, refreshToken, account: acct } = await tokenRes.json();

      localStorage.setItem('trivela_wallet_token', jwt);
      localStorage.setItem('trivela_wallet_account', acct);
      if (refreshToken) {
        localStorage.setItem('trivela_wallet_refresh_token', refreshToken);
      }

      setToken(jwt);
      setAccount(acct);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('trivela_wallet_token');
    localStorage.removeItem('trivela_wallet_account');
    localStorage.removeItem('trivela_wallet_refresh_token');
    setToken(null);
    setAccount(null);
    setError(null);
  }, []);

  const refreshToken = useCallback(async () => {
    const storedRefresh = localStorage.getItem('trivela_wallet_refresh_token');
    if (!storedRefresh) {
      signOut();
      return;
    }

    try {
      const res = await fetch(`${apiUrl()}/auth/sep10/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });

      if (!res.ok) {
        signOut();
        return;
      }

      const { token: newToken, refreshToken: newRefresh, account: acct } = await res.json();
      localStorage.setItem('trivela_wallet_token', newToken);
      localStorage.setItem('trivela_wallet_account', acct);
      if (newRefresh) {
        localStorage.setItem('trivela_wallet_refresh_token', newRefresh);
      }
      setToken(newToken);
      setAccount(acct);
    } catch {
      signOut();
    }
  }, [signOut]);

  const isAuthenticated = !!token && !!account;

  return {
    signIn,
    signOut,
    refreshToken,
    isAuthenticated,
    isAuthenticating,
    token,
    account,
    error,
  };
}

/**
 * WalletSignIn — Sign in with Stellar wallet button component.
 */
export function WalletSignIn({ walletAddress, signTransaction, onSignIn, auth }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const { signIn, isAuthenticated, isAuthenticating, account } = auth;

  const handleClick = async () => {
    if (!walletAddress) return;
    setIsSubmitting(true);
    setLocalError('');

    try {
      await signIn(walletAddress, signTransaction);
      onSignIn?.();
    } catch (err) {
      setLocalError(err.message || 'Sign in failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="wallet-auth-status">
        <span className="wallet-auth-label">Authenticated as</span>
        <strong className="wallet-auth-address">
          {account?.slice(0, 6)}...{account?.slice(-4)}
        </strong>
      </div>
    );
  }

  return (
    <div className="wallet-auth">
      <button
        type="button"
        className="btn btn-primary btn-button"
        disabled={isSubmitting || isAuthenticating || !walletAddress}
        onClick={handleClick}
      >
        {isSubmitting || isAuthenticating ? 'Signing...' : 'Sign in with Stellar'}
      </button>
      {localError && (
        <p className="wallet-auth-error" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}
