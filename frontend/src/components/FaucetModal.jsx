/**
 * FaucetModal - In-app testnet faucet for funding new accounts
 * Provides rate-limited friendbot integration with abuse guards
 */

import { useState } from 'react';
import { resolveStellarNetworkConfig } from '../config';

export default function FaucetModal({ isOpen, onClose, publicKey, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const networkConfig = resolveStellarNetworkConfig();

  const handleFund = async () => {
    if (!publicKey) {
      setError('No wallet connected');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/v1/faucet/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fund account');
      }

      setSuccess(true);
      setTxHash(data.hash);
      onSuccess?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Fund Testnet Account</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        {networkConfig.network !== 'testnet' ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">
              <strong>Mainnet Notice:</strong> The faucet is only available on testnet. To acquire
              assets on mainnet, please use a Stellar exchange or transfer from another wallet.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-gray-600 text-sm mb-2">
                Get 10,000 test XLM from Friendbot to start participating in campaigns.
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Connected Wallet:</p>
                <p className="text-sm font-mono break-all">{publicKey || 'Not connected'}</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-green-800 text-sm font-medium mb-1">
                  ✓ Account funded successfully!
                </p>
                {txHash && (
                  <p className="text-xs text-green-600 font-mono break-all">TX: {txHash}</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleFund}
                disabled={loading || !publicKey || success}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Funding...' : success ? 'Funded' : 'Fund Account'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Rate limited to 5 requests per hour to prevent abuse.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
