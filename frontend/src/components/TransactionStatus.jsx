import { useState } from 'react';
import './TransactionStatus.css';

const VARIANT_ICON = { success: '✓', pending: '⏳', error: '✕' };
const VARIANT_DEFAULT_LABEL = {
  success: 'Success',
  pending: 'Awaiting confirmation…',
  error: 'Failed',
};

/**
 * TransactionStatus — displays the state of an on-chain action. Supports an
 * optimistic lifecycle via `variant`: a `pending` card (shown immediately on
 * submit, before a hash exists), a `success` card once confirmed, and an
 * `error` card with a mapped message when the action is rolled back.
 *
 * @param {string} [hash] - The full transaction hash (absent while pending).
 * @param {string} network - The Stellar network (e.g., 'testnet', 'mainnet').
 * @param {'success'|'pending'|'error'} [variant='success'] - Lifecycle state.
 * @param {string} [status] - Override label (defaults per variant).
 * @param {string} [message] - Extra detail line (e.g. the rolled-back error).
 */
export default function TransactionStatus({ hash, network, variant = 'success', status, message }) {
  const [copied, setCopied] = useState(false);

  const shortenedHash = hash ? `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}` : '';

  const explorerUrl = `https://stellar.expert/explorer/${network}/tx/${hash}`;
  const label = status ?? VARIANT_DEFAULT_LABEL[variant] ?? VARIANT_DEFAULT_LABEL.success;
  const isError = variant === 'error';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transaction hash:', err);
    }
  };

  // Backward compatible: with no hash the card only renders for non-success
  // (pending/error) lifecycle states.
  if (!hash && variant === 'success') return null;

  return (
    <div
      className={`tx-status tx-status--${variant}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="tx-status-header">
        <span className="tx-status-icon" aria-hidden="true">
          {VARIANT_ICON[variant] ?? VARIANT_ICON.success}
        </span>
        <span className="tx-status-label">{label}</span>
      </div>

      {message && <p className="tx-status-message">{message}</p>}

      {hash && (
        <div className="tx-status-body">
          <div className="tx-hash-container">
            <span className="tx-hash-label">Transaction Hash</span>
            <div className="tx-hash-row">
              <code className="tx-hash-value" title={hash}>
                {shortenedHash}
              </code>
              <button
                type="button"
                className={`tx-copy-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied to clipboard' : 'Copy transaction hash'}
              >
                {copied ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-explorer-link"
          >
            View on Stellar Expert
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
