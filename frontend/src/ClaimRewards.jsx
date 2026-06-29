import { useEffect, useId, useState } from 'react';
import {
  submitClaimTransaction,
  submitRedeemTransaction,
  fetchPayoutReserveBalance,
  getStellarNetwork,
} from './stellar';
import TransactionStatus from './components/TransactionStatus';
import { useOptimisticAction } from './hooks/useOptimisticAction';
import { analytics } from './lib/analytics';

/**
 * ClaimRewards — lets the user enter a points amount and either claim
 * internal points or redeem for a real Stellar asset (XLM/USDC via SAC).
 *
 * Props
 * ─────
 * @param {string}   walletAddress   – Connected Stellar public key.
 * @param {boolean}  [hasPayoutAsset]– Whether a payout asset is configured.
 * @param {function} onClaimSuccess  – Called after a successful claim/redeem.
 */
export default function ClaimRewards({ walletAddress, hasPayoutAsset = false, onClaimSuccess }) {
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [redeemResult, setRedeemResult] = useState(null);
  const [reserveBalance, setReserveBalance] = useState('');
  const [mode, setMode] = useState(hasPayoutAsset ? 'redeem' : 'claim');
  const amountId = useId();
  const headingId = useId();
  const feedbackId = useId();
  const stellarNetwork = getStellarNetwork();
  const { run, isPending, isError, error } = useOptimisticAction();

  useEffect(() => {
    if (hasPayoutAsset && walletAddress) {
      fetchPayoutReserveBalance()
        .then(setReserveBalance)
        .catch(() => setReserveBalance(''));
    }
  }, [hasPayoutAsset, walletAddress]);

  useEffect(() => {
    setMode(hasPayoutAsset ? 'redeem' : 'claim');
  }, [hasPayoutAsset]);

  const parsedAmount = Number(amount);
  const isValid = Number.isInteger(parsedAmount) && parsedAmount > 0;
  const feedbackDescribedBy = txHash || isError ? feedbackId : undefined;

  const handleClaim = async (event) => {
    event.preventDefault();
    if (!walletAddress || !isValid) return;

    setTxHash('');
    setRedeemResult(null);
    const submittedAmount = amount;

    if (mode === 'redeem') {
      await run(() => submitRedeemTransaction(walletAddress, parsedAmount), {
        optimistic: () => setAmount(''),
        rollback: () => setAmount(submittedAmount),
        reconcile: ({ hash, assetAmount }) => {
          setTxHash(hash);
          setRedeemResult({ points: submittedAmount, asset: assetAmount });
          onClaimSuccess?.();
          fetchPayoutReserveBalance().then(setReserveBalance).catch(() => {});
        },
      });
    } else {
      await run(() => submitClaimTransaction(walletAddress, parsedAmount), {
        optimistic: () => setAmount(''),
        rollback: () => setAmount(submittedAmount),
        reconcile: ({ hash, newBalance }) => {
          setTxHash(hash);
          onClaimSuccess?.(newBalance);
        },
      });
    }
  };

  return (
    <section className="claim-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="claim-heading">
        {mode === 'redeem' ? 'Redeem for asset' : 'Claim rewards'}
      </h3>

      {hasPayoutAsset && (
        <div className="claim-mode-toggle" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            type="button"
            className={`btn ${mode === 'redeem' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('redeem')}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
          >
            Redeem asset
          </button>
          <button
            type="button"
            className={`btn ${mode === 'claim' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('claim')}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
          >
            Claim points
          </button>
        </div>
      )}

      {mode === 'redeem' && reserveBalance && (
        <p className="claim-reserve-info" style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
          Reserve: {reserveBalance} tokens available
        </p>
      )}

      <form className="claim-form" onSubmit={handleClaim}>
        <label htmlFor={amountId} className="claim-label">
          {mode === 'redeem' ? 'Points to redeem' : 'Amount to claim'}
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
            {isPending ? 'Signing…' : mode === 'redeem' ? 'Redeem' : 'Claim'}
          </button>
        </div>
      </form>

      {isPending && (
        <TransactionStatus
          variant="pending"
          network={stellarNetwork}
          status={mode === 'redeem' ? 'Redeeming…' : 'Claiming…'}
        />
      )}
      {!isPending && txHash && (
        <TransactionStatus hash={txHash} network={stellarNetwork} status="Transaction confirmed" />
      )}

      {!isPending && redeemResult && (
        <div
          className="claim-redeem-result"
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginTop: '8px',
            fontSize: '0.9rem',
          }}
        >
          Redeemed {redeemResult.points} points → received {redeemResult.asset} tokens
        </div>
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
