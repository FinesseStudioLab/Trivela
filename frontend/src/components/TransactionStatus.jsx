import { useState } from 'react';
import { RECOVERY_ACTION, RECOVERY_ACTION_META } from '../lib/errorMapping';
import { useTransactionRecovery } from '../hooks/useTransactionRecovery';
import './TransactionStatus.css';

const VARIANT_ICON = { success: '✓', pending: '⏳', error: '✕' };
const VARIANT_DEFAULT_LABEL = {
  success: 'Success',
  pending: 'Awaiting confirmation…',
  error: 'Failed',
};

/**
 * TransactionStatus — displays the state of an on-chain action. Supports an
 * optimistic lifecycle via `variant` and, on errors, renders per-class
 * recovery action buttons driven by `mappedError.recoveryActions`.
 *
 * @param {string}  [hash]        - The full transaction hash (absent while pending).
 * @param {string}  network       - The Stellar network (e.g., 'testnet', 'mainnet').
 * @param {'success'|'pending'|'error'} [variant='success'] - Lifecycle state.
 * @param {string}  [status]      - Override label (defaults per variant).
 * @param {string}  [message]     - Extra detail line (e.g. the rolled-back error).
 * @param {object}  [mappedError] - Structured error from lib/errorMapping#mapError().
 *                                  Drives which recovery actions are shown.
 * @param {()=>void} [onRetry]    - Called when the user triggers retry / re-sign.
 * @param {()=>void} [onSwitchWallet] - Called when the user chooses to switch wallet.
 * @param {()=>void} [onTopUp]    - Called when the user chooses to top-up funds.
 */
export default function TransactionStatus({
  hash,
  network = 'testnet',
  variant = 'success',
  status,
  message,
  mappedError,
  onRetry,
  onSwitchWallet,
  onTopUp,
}) {
  const [copied, setCopied] = useState(false);

  const { handlers, getExplorerUrl, getReportUrl } = useTransactionRecovery({
    onRetry,
    onSwitchWallet,
    onTopUp,
    network,
    hash,
  });

  const shortenedHash = hash ? `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}` : '';
  const explorerUrl = hash ? getExplorerUrl(hash) : null;
  const label = status ?? VARIANT_DEFAULT_LABEL[variant] ?? VARIANT_DEFAULT_LABEL.success;
  const isError = variant === 'error';

  // Recovery actions to render, sourced from the structured mapped error.
  const recoveryActions =
    isError && mappedError?.recoveryActions?.length ? mappedError.recoveryActions : [];

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

      {/* ── Recovery actions ─────────────────────────────────────────────── */}
      {recoveryActions.length > 0 && (
        <div className="tx-recovery-actions" role="group" aria-label="Recovery options">
          {recoveryActions.map((action) => {
            const meta = RECOVERY_ACTION_META[action];
            if (!meta) return null;

            // VIEW_EXPLORER and REPORT open external URLs; render as <a>.
            if (action === RECOVERY_ACTION.VIEW_EXPLORER && explorerUrl) {
              return (
                <a
                  key={action}
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-recovery-btn tx-recovery-btn--secondary"
                  aria-label={meta.description}
                >
                  {meta.label}
                  <svg
                    width="12"
                    height="12"
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
              );
            }

            if (action === RECOVERY_ACTION.REPORT) {
              return (
                <a
                  key={action}
                  href={getReportUrl(mappedError?.code ?? null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-recovery-btn tx-recovery-btn--ghost"
                  aria-label={meta.description}
                >
                  {meta.label}
                </a>
              );
            }

            // All other actions (RETRY, RE_SIGN, SWITCH_WALLET, TOP_UP) are buttons.
            const isPrimary =
              action === RECOVERY_ACTION.RETRY || action === RECOVERY_ACTION.RE_SIGN;

            return (
              <button
                key={action}
                type="button"
                className={`tx-recovery-btn ${isPrimary ? 'tx-recovery-btn--primary' : 'tx-recovery-btn--secondary'}`}
                onClick={() => handlers[action]?.()}
                aria-label={meta.description}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Transaction hash + explorer link ─────────────────────────────── */}
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

          {explorerUrl && !recoveryActions.includes(RECOVERY_ACTION.VIEW_EXPLORER) && (
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
          )}
        </div>
      )}
    </div>
  );
}
