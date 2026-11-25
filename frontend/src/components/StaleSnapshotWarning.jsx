/**
 * StaleSnapshotWarning
 *
 * Displays a prominent advisory banner when a voter's current on-chain token
 * balance is lower than the balance recorded at vote-snapshot time.
 *
 * This situation arises when tokens are transferred out after the snapshot is
 * taken but before the vote closes.  The voter's weight is still the snapshot
 * balance (that is by design — see docs/GOVERNANCE.md, "Voting Power
 * Snapshots"), but the warning lets them know their current holdings no longer
 * match their voting power.
 *
 * The banner is advisory only: it does not prevent voting.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * @param {object} props
 * @param {bigint|number} props.snapshotBalance  Token units at snapshot time.
 * @param {bigint|number} props.currentBalance   Token units currently held.
 * @param {string}        [props.tokenSymbol]    Display symbol, e.g. "TRV".
 * @param {string}        [props.className]      Extra CSS class names.
 */
export function StaleSnapshotWarning({
  snapshotBalance,
  currentBalance,
  tokenSymbol = 'tokens',
  className = '',
}) {
  const snap = BigInt(snapshotBalance);
  const curr = BigInt(currentBalance);

  if (curr >= snap) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`stale-snapshot-warning ${className}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #f59e0b',
        backgroundColor: '#fffbeb',
        color: '#92400e',
        fontSize: '0.875rem',
        lineHeight: '1.5',
        marginBottom: '1rem',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
      <div>
        <strong>Stale snapshot detected</strong>
        <p style={{ margin: '0.25rem 0 0' }}>
          Your voting power was fixed at snapshot time (
          <strong>{snap.toLocaleString()} {tokenSymbol}</strong>).
          Your current balance (
          <strong>{curr.toLocaleString()} {tokenSymbol}</strong>)
          is lower, which means tokens were transferred out after the snapshot was taken.
          Your vote will still count with your snapshot balance — this is expected behaviour —
          but results may not reflect your present economic stake.
        </p>
      </div>
    </div>
  );
}

StaleSnapshotWarning.propTypes = {
  snapshotBalance: PropTypes.oneOfType([PropTypes.bigint, PropTypes.number]).isRequired,
  currentBalance: PropTypes.oneOfType([PropTypes.bigint, PropTypes.number]).isRequired,
  tokenSymbol: PropTypes.string,
  className: PropTypes.string,
};

export default StaleSnapshotWarning;
