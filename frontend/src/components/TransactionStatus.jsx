import { useState } from 'react';
import './TransactionStatus.css';

/**
 * TransactionStatus — A premium component to display on-chain transaction results.
 *
 * @param {string} hash - The full transaction hash.
 * @param {string} network - The Stellar network (e.g., 'testnet', 'mainnet').
 * @param {string} [status='Success'] - The transaction status label.
 */
export default function TransactionStatus({ hash, network, status = 'Success' }) {
  const [copied, setCopied] = useState(false);

  const shortenedHash = hash ? `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}` : '';

  const explorerUrl = `https://stellar.expert/explorer/${network}/tx/${hash}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transaction hash:', err);
    }
  };

  if (!hash) return null;

  return (
    <div className="tx-status" role="status" aria-live="polite">
      <div className="tx-status-header">
        <span className="tx-status-icon" aria-hidden="true">
          ✓
        </span>
        <span className="tx-status-label">{status}</span>
      </div>

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
    </div>
  );
}
