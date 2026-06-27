import { useEffect, useId, useState } from 'react';
import {
  submitRegisterTransaction,
  checkParticipantStatus,
  normalizeError,
  getCampaignContractId,
  getStellarNetwork,
} from './stellar';
import TransactionStatus from './components/TransactionStatus';
import { useOptimisticAction } from './hooks/useOptimisticAction';
import { CampaignClient } from './contracts/campaign';
import { createSorobanServer, getNetworkPassphrase, getSorobanRpcUrl } from './config';

/**
 * Privacy mode constants matching the contract enum.
 */
const PRIVACY_MODE = {
  NONE: 0,
  MERKLE: 1,
  ZK: 2,
};

const PRIVACY_LABELS = {
  [PRIVACY_MODE.NONE]: 'Open',
  [PRIVACY_MODE.MERKLE]: 'Allowlist',
  [PRIVACY_MODE.ZK]: 'Zero-Knowledge',
};

const NOTICE_STYLE = {
  background: 'rgba(99, 102, 241, 0.1)',
  border: '1px solid rgba(99, 102, 241, 0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '0.85rem',
  color: '#a5b4fc',
  marginTop: '8px',
};

const FALLBACK_STYLE = {
  background: 'rgba(251, 191, 36, 0.1)',
  border: '1px solid rgba(251, 191, 36, 0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '0.85rem',
  color: '#fbbf24',
  marginTop: '8px',
};

/**
 * RegisterCampaign — lets the connected wallet register as a campaign
 * participant by calling the campaign contract's `register(participant)`.
 *
 * Supports three privacy modes:
 * - None (0): open registration, no proofs required.
 * - Merkle (1): standard Merkle allowlist registration.
 * - Zk (2): zero-knowledge proof registration with Merkle fallback.
 *
 * Props
 * ─────
 * @param {string} walletAddress – Connected Stellar public key.
 */
export default function RegisterCampaign({ walletAddress, onRegistered }) {
  const [isRegistered, setIsRegistered] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [checkError, setCheckError] = useState('');
  const [notice, setNotice] = useState('');
  const [privacyMode, setPrivacyMode] = useState(null);
  const [fallbackAllowed, setFallbackAllowed] = useState(false);
  const [zkSupported, setZkSupported] = useState(null);
  const headingId = useId();
  const statusId = useId();
  const campaignContractId = getCampaignContractId();
  const stellarNetwork = getStellarNetwork();
  const { run, isPending, isError, error } = useOptimisticAction();

  /* Fetch privacy mode on mount */
  useEffect(() => {
    if (!campaignContractId) return;

    let cancelled = false;
    const client = new CampaignClient({
      rpcUrl: getSorobanRpcUrl(),
      networkPassphrase: getNetworkPassphrase(),
      contractId: campaignContractId,
    });

    Promise.all([
      client.get_privacy_mode().then((tx) => tx.simulate()),
      client.is_fallback_allowed().then((tx) => tx.simulate()),
    ])
      .then(([mode, fallback]) => {
        if (!cancelled) {
          setPrivacyMode(mode);
          setFallbackAllowed(fallback);
        }
      })
      .catch(() => {
        if (!cancelled) setPrivacyMode(PRIVACY_MODE.NONE);
      });

    return () => { cancelled = true; };
  }, [campaignContractId]);

  /* Check ZK prover support (Web Worker + WASM) */
  useEffect(() => {
    if (privacyMode !== PRIVACY_MODE.ZK) return;

    let cancelled = false;
    const checkZkSupport = async () => {
      try {
        if (typeof Worker === 'undefined') {
          if (!cancelled) setZkSupported(false);
          return;
        }
        // Check if WASM is available
        if (typeof WebAssembly === 'undefined') {
          if (!cancelled) setZkSupported(false);
          return;
        }
        if (!cancelled) setZkSupported(true);
      } catch {
        if (!cancelled) setZkSupported(false);
      }
    };
    checkZkSupport();
    return () => { cancelled = true; };
  }, [privacyMode]);

  /* On mount (and when the wallet changes), check participant status. */
  useEffect(() => {
    if (!walletAddress || !campaignContractId) {
      setIsRegistered(null);
      setCheckError('');
      setNotice('');
      return;
    }

    let cancelled = false;
    setIsChecking(true);
    setCheckError('');
    setNotice('');

    checkParticipantStatus(walletAddress)
      .then((registered) => {
        if (!cancelled) setIsRegistered(registered);
      })
      .catch((err) => {
        if (!cancelled) setCheckError(normalizeError(err));
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, campaignContractId]);

  const handleRegister = async () => {
    if (!walletAddress) return;

    setNotice('');
    setTxHash('');
    setCheckError('');
    const previousStatus = isRegistered;

    await run(() => submitRegisterTransaction(walletAddress), {
      optimistic: () => setIsRegistered(true),
      rollback: () => setIsRegistered(previousStatus),
      reconcile: ({ hash, alreadyRegistered }) => {
        setTxHash(hash);
        if (alreadyRegistered) {
          setNotice('You were already registered in this campaign.');
        } else {
          onRegistered?.();
        }
      },
    });
  };

  if (!campaignContractId) return null;

  const modeLabel = privacyMode !== null ? PRIVACY_LABELS[privacyMode] : '…';
  const statusLabel = isChecking
    ? 'Checking…'
    : isPending
      ? 'Registering…'
      : isRegistered === true
        ? '✓ Registered'
        : isRegistered === false
          ? 'Not registered'
          : '—';

  const showRegisterButton = !isRegistered && (
    privacyMode !== PRIVACY_MODE.ZK ||
    zkSupported === true ||
    (zkSupported === false && fallbackAllowed)
  );

  const zkBlocked = privacyMode === PRIVACY_MODE.ZK && zkSupported === false && !fallbackAllowed;

  return (
    <section
      className="register-section"
      aria-labelledby={headingId}
      aria-busy={isChecking || isPending}
    >
      <h3 id={headingId} className="register-heading">
        Campaign registration
      </h3>

      <div className="register-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <span className="register-status-label">Participant status </span>
          <strong id={statusId} className={isRegistered ? 'register-active' : ''} aria-live="polite">
            {statusLabel}
          </strong>
        </div>
        {privacyMode !== null && (
          <span
            style={{
              fontSize: '0.75rem',
              padding: '3px 8px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
            }}
          >
            {modeLabel} mode
          </span>
        )}
      </div>

      {showRegisterButton && (
        <button
          type="button"
          className="btn btn-primary btn-button"
          disabled={isPending || isChecking || !walletAddress}
          aria-describedby={statusId}
          onClick={handleRegister}
        >
          {isPending ? 'Signing…' : 'Register in campaign'}
        </button>
      )}

      {zkBlocked && (
        <div style={FALLBACK_STYLE}>
          Your browser does not support zero-knowledge proofs. Contact the campaign operator to enable fallback registration.
        </div>
      )}

      {privacyMode === PRIVACY_MODE.ZK && zkSupported === true && !isRegistered && (
        <div style={NOTICE_STYLE}>
          This campaign uses zero-knowledge proofs for privacy-preserving registration.
        </div>
      )}

      {isPending && (
        <TransactionStatus variant="pending" network={stellarNetwork} status="Registering…" />
      )}
      {!isPending && txHash && (
        <TransactionStatus hash={txHash} network={stellarNetwork} status="Registered" />
      )}

      {notice && (
        <p className="register-note" role="status">
          {notice}
        </p>
      )}
      {isError && error && (
        <p className="register-error" role="alert">
          {error.message}
          {error.recovery ? ` ${error.recovery}.` : ''}
        </p>
      )}
      {checkError && (
        <p className="register-error" role="alert">
          {checkError}
        </p>
      )}
    </section>
  );
}
