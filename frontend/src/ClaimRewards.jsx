import { useId, useState, useEffect } from 'react';
import { submitClaimTransaction, getStellarNetwork } from './stellar';
import TransactionStatus from './components/TransactionStatus';
import { useOptimisticAction } from './hooks/useOptimisticAction';
import { apiUrl } from './config';

/**
 * ClaimRewards — lets the user enter a points amount, sign a Soroban
 * `claim(user, amount)` transaction via Freighter, and see the result.
 *
 * When a payout asset is configured for the campaign, the user can also
 * claim real assets (XLM/USDC via Stellar Asset Contract).
 *
 * Props
 * ─────
 * @param {string}   walletAddress   – Connected Stellar public key.
 * @param {function} onClaimSuccess  – Called with the new balance string after
 *                                     a successful claim so the parent can
 *                                     refresh its display.
 * @param {string}   [campaignId]    – Campaign ID for payout asset info.
 */
export default function ClaimRewards({ walletAddress, onClaimSuccess, campaignId }) {
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [claimMode, setClaimMode] = useState('points');
  const [payoutInfo, setPayoutInfo] = useState(null);
  const amountId = useId();
  const headingId = useId();
  const feedbackId = useId();
  const stellarNetwork = getStellarNetwork();
  const { run, isPending, isError, error } = useOptimisticAction();

  const parsedAmount = Number(amount);
  const isValid = Number.isInteger(parsedAmount) && parsedAmount > 0;
  const feedbackDescribedBy = txHash || isError ? feedbackId : undefined;

  useEffect(() => {
    if (!campaignId) return;

    const fetchPayoutInfo = async () => {
      try {
        const res = await fetch(
          `${apiUrl()}/api/v1/campaigns/${campaignId}/payout-info`,
        );
        if (res.ok) {
          const data = await res.json();
          setPayoutInfo(data);
        }
      } catch {
        // Payout info unavailable — points-only mode
      }
    };

    fetchPayoutInfo();
  }, [campaignId]);

  const handleClaim = async (event) => {
    event.preventDefault();
    if (!walletAddress || !isValid) return;

    setTxHash('');
    const submittedAmount = amount;

    await run(() => submitClaimTransaction(walletAddress, parsedAmount), {
      optimistic: () => setAmount(''),
      rollback: () => setAmount(submittedAmount),
      reconcile: ({ hash, newBalance }) => {
        setTxHash(hash);
        onClaimSuccess?.(newBalance);
      },
    });
  };

  const estimatedAssetAmount =
    payoutInfo && claimMode === 'asset'
      ? Math.floor((parsedAmount * (payoutInfo.rateNum || 0)) / (payoutInfo.rateDen || 1))
      : 0;

  return (
    <section className="claim-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="claim-heading">
        Claim rewards
      </h3>

      {payoutInfo && (
        <div className="claim-mode-toggle">
          <button
            type="button"
            className={`btn btn-small ${claimMode === 'points' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setClaimMode('points')}
          >
            Points
          </button>
          <button
            type="button"
            className={`btn btn-small ${claimMode === 'asset' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setClaimMode('asset')}
          >
            {payoutInfo.assetSymbol || 'Asset'}
          </button>
        </div>
      )}

      {payoutInfo && claimMode === 'asset' && (
        <div className="claim-payout-info">
          <div className="payout-rate">
            Rate: 1 point = {payoutInfo.rateNum}/{payoutInfo.rateDen}{' '}
            {payoutInfo.assetSymbol || 'asset'}
          </div>
          <div className="payout-reserve">
            Reserve: {payoutInfo.reserveBalance} {payoutInfo.assetSymbol || 'asset'}
          </div>
        </div>
      )}

      <form className="claim-form" onSubmit={handleClaim}>
        <label htmlFor={amountId} className="claim-label">
          Amount to claim ({claimMode === 'points' ? 'points' : payoutInfo?.assetSymbol || 'asset'})
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
            disabled={isPending || !walletAddress || !isValid}
          >
            {isPending ? 'Claiming...' : 'Claim'}
          </button>
        </div>

        {claimMode === 'asset' && parsedAmount > 0 && (
          <div className="claim-estimate">
            Estimated payout: ~{estimatedAssetAmount} {payoutInfo?.assetSymbol || 'asset'}
          </div>
        )}

        {isPending && (
          <TransactionStatus variant="pending" network={stellarNetwork} status="Claiming..." />
        )}
        {!isPending && txHash && (
          <TransactionStatus hash={txHash} network={stellarNetwork} status="Claimed" />
        )}

        {isError && error && (
          <p className="claim-error" id={feedbackId} role="alert">
            {error.message}
            {error.recovery ? ` ${error.recovery}.` : ''}
          </p>
        )}
      </form>
    </section>
  );
}
