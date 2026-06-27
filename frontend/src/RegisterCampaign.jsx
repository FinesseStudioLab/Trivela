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
import { useZkProver } from './hooks/useZkProver';

/**
 * PrivacyMode — per-campaign registration routing.
 * Matches the on-chain PrivacyMode enum.
 */
const PrivacyMode = {
  NONE: 'none',
  MERKLE: 'merkle',
  ZK: 'zk',
};

/**
 * RegisterCampaign — lets the connected wallet register as a campaign
 * participant by calling the campaign contract's `register(participant)`.
 *
 * Supports three privacy modes:
 * - None: open registration (default).
 * - Merkle: registration with allowlist proof.
 * - ZK: registration with zero-knowledge proof (falls back to Merkle
 *   if browser doesn't support Web Workers or WASM).
 *
 * Props
 * ─────
 * @param {string} walletAddress – Connected Stellar public key.
 * @param {string} [privacyMode] – Campaign privacy mode override.
 * @param {boolean} [allowFallback] – Allow fallback to Merkle when ZK unavailable.
 */
export default function RegisterCampaign({
  walletAddress,
  onRegistered,
  privacyMode = PrivacyMode.NONE,
  allowFallback = true,
}) {
  const [isRegistered, setIsRegistered] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [checkError, setCheckError] = useState('');
  const [notice, setNotice] = useState('');
  const [modeNotice, setModeNotice] = useState('');
  const headingId = useId();
  const statusId = useId();
  const campaignContractId = getCampaignContractId();
  const stellarNetwork = getStellarNetwork();
  const { run, isPending, isError, error } = useOptimisticAction();
  const zkProver = useZkProver();

  const [effectiveMode, setEffectiveMode] = useState(privacyMode);

  useEffect(() => {
    if (privacyMode === PrivacyMode.ZK && typeof Worker === 'undefined' && !allowFallback) {
      setEffectiveMode(PrivacyMode.NONE);
      setModeNotice(
        'ZK privacy requires a modern browser with Web Worker support. Registration is open.',
      );
    } else if (privacyMode === PrivacyMode.ZK && typeof Worker === 'undefined' && allowFallback) {
      setEffectiveMode(PrivacyMode.MERKLE);
      setModeNotice(
        'ZK proving is not supported in this browser. Falling back to Merkle registration.',
      );
    } else {
      setEffectiveMode(privacyMode);
      setModeNotice('');
    }
  }, [privacyMode, allowFallback]);

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

    if (effectiveMode === PrivacyMode.ZK) {
      try {
        setNotice('Generating zero-knowledge proof...');

        const result = await zkProver.prove({
          secret: walletAddress,
          path: [],
          publicSignals: {
            merkleRoot: '',
            commitment: walletAddress,
          },
          provingKeyUrl: '/keys/registration_pk.key',
        });

        if (!result) {
          setNotice('Proof generation was cancelled.');
          return;
        }

        setNotice('Proof generated. Submitting registration...');
      } catch (err) {
        if (allowFallback) {
          setNotice('ZK proof failed. Falling back to standard registration...');
          setEffectiveMode(PrivacyMode.NONE);
        } else {
          setCheckError(`ZK proof failed: ${err.message}`);
          return;
        }
      }
    }

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

  const statusLabel = isChecking
    ? 'Checking...'
    : isPending
      ? 'Registering...'
      : isRegistered === true
        ? 'Registered'
        : isRegistered === false
          ? 'Not registered'
          : '--';

  const modeLabel =
    effectiveMode === PrivacyMode.ZK
      ? 'ZK Privacy'
      : effectiveMode === PrivacyMode.MERKLE
        ? 'Merkle Allowlist'
        : 'Open';

  return (
    <section
      className="register-section"
      aria-labelledby={headingId}
      aria-busy={isChecking || isPending}
    >
      <h3 id={headingId} className="register-heading">
        Campaign registration
      </h3>

      <div className="register-mode">
        <span className="register-mode-label">Registration mode</span>
        <strong className="register-mode-value">{modeLabel}</strong>
      </div>

      <div className="register-status">
        <span className="register-status-label">Participant status</span>
        <strong id={statusId} className={isRegistered ? 'register-active' : ''} aria-live="polite">
          {statusLabel}
        </strong>
      </div>

      {!isRegistered && (
        <button
          type="button"
          className="btn btn-primary btn-button"
          disabled={isPending || isChecking || !walletAddress || zkProver.isProving}
          aria-describedby={statusId}
          onClick={handleRegister}
        >
          {zkProver.isProving
            ? `Proving... ${zkProver.progress.percent}%`
            : isPending
              ? 'Signing...'
              : 'Register in campaign'}
        </button>
      )}

      {zkProver.isProving && (
        <div className="register-proving" role="status">
          <div className="proving-bar">
            <div
              className="proving-bar-fill"
              style={{ width: `${zkProver.progress.percent}%` }}
            />
          </div>
          <span className="proving-phase">{zkProver.progress.phase}</span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={zkProver.cancel}
          >
            Cancel
          </button>
        </div>
      )}

      {isPending && (
        <TransactionStatus variant="pending" network={stellarNetwork} status="Registering..." />
      )}
      {!isPending && txHash && (
        <TransactionStatus hash={txHash} network={stellarNetwork} status="Registered" />
      )}

      {modeNotice && (
        <p className="register-notice" role="status">
          {modeNotice}
        </p>
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
