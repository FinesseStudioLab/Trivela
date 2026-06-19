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

/**
 * RegisterCampaign — lets the connected wallet register as a campaign
 * participant by calling the campaign contract's `register(participant)`.
 *
 * The submit flow is optimistic: the participant status flips to "Registered"
 * the instant the user clicks, then either confirms on success or rolls back to
 * the previous status on failure (with a class-aware error). A second click
 * while a registration is in flight is ignored (double-submit guard).
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
  const headingId = useId();
  const statusId = useId();
  const campaignContractId = getCampaignContractId();
  const stellarNetwork = getStellarNetwork();
  const { run, isPending, isError, error } = useOptimisticAction();

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
      // Optimistic: reflect "registered" immediately so the action feels instant.
      optimistic: () => setIsRegistered(true),
      // Rollback: restore the prior status if the transaction fails.
      rollback: () => setIsRegistered(previousStatus),
      // Reconcile with chain truth once confirmed.
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
    ? 'Checking…'
    : isPending
      ? 'Registering…'
      : isRegistered === true
        ? '✓ Registered'
        : isRegistered === false
          ? 'Not registered'
          : '—';

  return (
    <section
      className="register-section"
      aria-labelledby={headingId}
      aria-busy={isChecking || isPending}
    >
      <h3 id={headingId} className="register-heading">
        Campaign registration
      </h3>

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
          disabled={isPending || isChecking || !walletAddress}
          aria-describedby={statusId}
          onClick={handleRegister}
        >
          {isPending ? 'Signing…' : 'Register in campaign'}
        </button>
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
