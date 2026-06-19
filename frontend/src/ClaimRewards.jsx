import { useId, useState } from 'react';
import { submitClaimTransaction, getStellarNetwork } from './stellar';
import TransactionStatus from './components/TransactionStatus';
import { useOptimisticAction } from './hooks/useOptimisticAction';

/**
 * ClaimRewards — lets the user enter a points amount, sign a Soroban
 * `claim(user, amount)` transaction via Freighter, and see the result.
 *
 * The submit is optimistic: the input clears and a pending indicator appears
 * immediately; on confirmation the parent reconciles the on-chain balance, and
 * on failure the entered amount is restored and a class-aware error is shown.
 * A second submit while one is in flight is ignored (double-submit guard).
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
  const [txHash, setTxHash] = useState('');
  const amountId = useId();
  const headingId = useId();
  const feedbackId = useId();
  const stellarNetwork = getStellarNetwork();
  const { run, isPending, isError, error } = useOptimisticAction();

  const parsedAmount = Number(amount);
  const isValid = Number.isInteger(parsedAmount) && parsedAmount > 0;
  const feedbackDescribedBy = txHash || isError ? feedbackId : undefined;

  const handleClaim = async (event) => {
    event.preventDefault();
    if (!walletAddress || !isValid) return;

    setTxHash('');
    const submittedAmount = amount;

    await run(() => submitClaimTransaction(walletAddress, parsedAmount), {
      // Optimistic: clear the input right away so the action feels instant.
      optimistic: () => setAmount(''),
      // Rollback: restore the amount the user entered if the claim fails.
      rollback: () => setAmount(submittedAmount),
      // Reconcile: surface the tx + let the parent refresh the chain balance.
      reconcile: ({ hash, newBalance }) => {
        setTxHash(hash);
        onClaimSuccess?.(newBalance);
      },
    });
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
            disabled={isPending || !walletAddress}
            aria-invalid={isError}
            aria-describedby={feedbackDescribedBy}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-button"
            disabled={!walletAddress || !isValid || isPending}
          >
            {isPending ? 'Signing…' : 'Claim'}
          </button>
        </div>
      </form>

      {isPending && (
        <TransactionStatus variant="pending" network={stellarNetwork} status="Claiming…" />
      )}
      {!isPending && txHash && (
        <TransactionStatus hash={txHash} network={stellarNetwork} status="Claim confirmed" />
      )}

      {isError && error && (
        <p id={feedbackId} className="claim-error" role="alert">
          {error.message}
          {error.recovery ? ` ${error.recovery}.` : ''}
        </p>
      )}
    </section>
  );
}
