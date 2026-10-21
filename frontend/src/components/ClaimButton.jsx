import React from 'react';

export function ClaimButton({
  status = 'ready', // 'ready' | 'loading' | 'claimed' | 'disabled'
  points = 100,
  onClick,
}) {
  const isClaimed = status === 'claimed';
  const isLoading = status === 'loading';
  const isDisabled = status === 'disabled' || isClaimed || isLoading;

  return (
    <button
      type="button"
      className={`btn btn-claim btn-claim--${status}`}
      disabled={isDisabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '8px',
        fontWeight: 600,
        fontSize: '0.9rem',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        border: 'none',
        background: isClaimed
          ? 'rgba(161, 177, 199, 0.2)'
          : isLoading
            ? 'var(--accent-soft, #4c8dff33)'
            : 'var(--accent, #4c8dff)',
        color: isClaimed ? 'var(--text-muted, #a1b1c7)' : '#ffffff',
        transition: 'all 0.2s ease',
      }}
    >
      {isLoading ? (
        <>
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          <span>Claiming...</span>
        </>
      ) : isClaimed ? (
        <>
          <span aria-hidden="true">✓</span>
          <span>Claimed</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">🎁</span>
          <span>Claim {points > 0 ? `${points} pts` : 'Reward'}</span>
        </>
      )}
    </button>
  );
}

export default ClaimButton;
