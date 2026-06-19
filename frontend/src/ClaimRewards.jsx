import { useId, useState } from 'react';
import { submitClaimTransaction, normalizeError, getStellarNetwork } from './stellar';
import TransactionStatus from './components/TransactionStatus';

/**
 * ClaimRewards — lets the user enter a points amount, sign a Soroban
 * `claim(user, amount)` transaction via Freighter, and see the result.
 *
 * Props
 * ─────
 * @param {string}   walletAddress   – Connected Stellar public key.
 * @param {function} onClaimSuccess  – Called with the new balance string after
 *                                     a successful claim so the parent can
 *                                     refresh its display.
 */
export default function ClaimRewards({ walletAddress, onClaimSuccess }) {
  const [amount, setAmount] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [claimError, setClaimError] = useState('');
  const amountId = useId();
  const headingId = useId();
  const feedbackId = useId();
  const feedbackDescribedBy = txHash || claimError ? feedbackId : undefined;
  const stellarNetwork = getStellarNetwork();

  const parsedAmount = Number(amount);
  const isValid = Number.isInteger(parsedAmount) && parsedAmount > 0;

  const handleClaim = async (event) => {
    event.preventDefault();
    if (!walletAddress || !isValid) return;

    setIsClaiming(true);
    setClaimError('');
    setTxHash('');

    try {
      const { hash, newBalance } = await submitClaimTransaction(walletAddress, parsedAmount);

      setTxHash(hash);
      setAmount('');

      if (onClaimSuccess) {
        onClaimSuccess(newBalance);
      }
    } catch (error) {
      setClaimError(normalizeError(error));
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <section className="claim-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="claim-heading">
        Claim rewards
      </h3>

      <form className="claim-form" onSubmit={handleClaim}>
        <label htmlFor={amountId} className="claim-label">
          Amount to claim
        </label>
        <div className="claim-input-row">
          <input
            id={amountId}
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 100"
            className="claim-input"
            value={amount}
            disabled={isClaiming || !walletAddress}
            aria-invalid={Boolean(claimError)}
            aria-describedby={feedbackDescribedBy}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-button"
            disabled={!walletAddress || !isValid || isClaiming}
          >
            {isClaiming ? 'Signing…' : 'Claim'}
          </button>
        </div>
      </form>

      {txHash && <TransactionStatus hash={txHash} network={stellarNetwork} />}

      {claimError && (
        <p id={feedbackId} className="claim-error" role="alert">
          {claimError}
        </p>
      )}
    </section>
  );
}
