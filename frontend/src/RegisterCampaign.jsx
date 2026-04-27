import { useEffect, useId, useState } from 'react';
import {
  submitRegisterTransaction,
  checkParticipantStatus,
  normalizeError,
  getCampaignContractId,
  getStellarNetwork,
} from './stellar';
import TransactionStatus from './components/TransactionStatus';

/**
 * RegisterCampaign — lets the connected wallet register as a campaign
 * participant by calling the campaign contract's `register(participant)`.
 *
 * Props
 * ─────
 * @param {string} walletAddress – Connected Stellar public key.
 */
export default function RegisterCampaign({ walletAddress }) {
  const [isRegistered, setIsRegistered] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const headingId = useId();
  const statusId = useId();
  const campaignContractId = getCampaignContractId();
  const stellarNetwork = getStellarNetwork();

  /* On mount (and when the wallet changes), check participant status. */
  useEffect(() => {
    if (!walletAddress || !campaignContractId) {
      setIsRegistered(null);
      setError('');
      setNotice('');
      return;
    }

    let cancelled = false;
    setIsChecking(true);
    setError('');
    setNotice('');

    checkParticipantStatus(walletAddress)
      .then((registered) => {
        if (!cancelled) setIsRegistered(registered);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeError(err));
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

    setIsRegistering(true);
    setError('');
    setNotice('');
    setTxHash('');

    try {
      const { hash, alreadyRegistered } = await submitRegisterTransaction(walletAddress);
      setTxHash(hash);
      setIsRegistered(true);

      if (alreadyRegistered) {
        setNotice('You were already registered in this campaign.');
      }
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsRegistering(false);
    }
  };

  if (!campaignContractId) return null;

  const statusLabel = isChecking
    ? 'Checking…'
    : isRegistered === true
      ? '✓ Registered'
      : isRegistered === false
        ? 'Not registered'
        : '—';

  return (
    <section
      className="register-section"
      aria-labelledby={headingId}
      aria-busy={isChecking || isRegistering}
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
          disabled={isRegistering || isChecking || !walletAddress}
          aria-describedby={statusId}
          onClick={handleRegister}
        >
          {isRegistering ? 'Signing…' : 'Register in campaign'}
        </button>
      )}

      {txHash && <TransactionStatus hash={txHash} network={stellarNetwork} />}

      {notice && (
        <p className="register-note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="register-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
