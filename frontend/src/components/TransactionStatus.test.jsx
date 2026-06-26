import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import TransactionStatus from './TransactionStatus';
import { RECOVERY_ACTION } from '../lib/errorMapping';

const HASH = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

const mappedNetworkError = {
  class: 'network',
  code: null,
  message: 'Network problem reaching the blockchain.',
  recoveryActions: [RECOVERY_ACTION.RETRY],
  retryable: true,
};

const mappedWalletError = {
  class: 'wallet',
  code: null,
  message: 'Signing was cancelled.',
  recoveryActions: [RECOVERY_ACTION.RE_SIGN],
  retryable: false,
};

const mappedInsufficientBalance = {
  class: 'contract',
  code: 2,
  message: 'Insufficient balance to claim this amount',
  recoveryActions: [RECOVERY_ACTION.TOP_UP],
  retryable: false,
};

const mappedPermissionError = {
  class: 'contract',
  code: 100,
  message: "You don't have permission to perform this action",
  recoveryActions: [RECOVERY_ACTION.SWITCH_WALLET],
  retryable: false,
};

const mappedContractRevert = {
  class: 'contract',
  code: 102,
  message: 'This campaign has reached its participant limit',
  recoveryActions: [RECOVERY_ACTION.VIEW_EXPLORER],
  retryable: false,
};

const mappedUnknownError = {
  class: 'unknown',
  code: null,
  message: 'An unexpected error occurred.',
  recoveryActions: [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.REPORT],
  retryable: true,
};

// ── Basic rendering ───────────────────────────────────────────────────────────

describe('TransactionStatus — basic rendering', () => {
  it('renders the success state with hash and explorer link', () => {
    render(<TransactionStatus hash={HASH} variant="success" network="testnet" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/success/i)).toBeInTheDocument();
    expect(screen.getByText(/View on Stellar Expert/i)).toBeInTheDocument();
  });

  it('renders the pending state without a hash', () => {
    render(<TransactionStatus variant="pending" network="testnet" />);
    expect(screen.getByText(/awaiting confirmation/i)).toBeInTheDocument();
  });

  it('renders the error state with an alert role', () => {
    render(
      <TransactionStatus variant="error" network="testnet" mappedError={mappedNetworkError} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
  });

  it('renders a custom status label override', () => {
    render(<TransactionStatus hash={HASH} variant="success" status="Claim submitted" />);
    expect(screen.getByText('Claim submitted')).toBeInTheDocument();
  });

  it('renders the message prop when provided', () => {
    render(
      <TransactionStatus
        variant="error"
        network="testnet"
        message="Transaction was rolled back"
        mappedError={mappedNetworkError}
      />,
    );
    expect(screen.getByText('Transaction was rolled back')).toBeInTheDocument();
  });

  it('returns null for a success variant with no hash', () => {
    const { container } = render(<TransactionStatus variant="success" />);
    expect(container.firstChild).toBeNull();
  });
});

// ── Recovery action buttons ───────────────────────────────────────────────────

describe('TransactionStatus — recovery action buttons', () => {
  it('shows no recovery actions on a success variant', () => {
    render(<TransactionStatus hash={HASH} variant="success" mappedError={mappedNetworkError} />);
    expect(screen.queryByRole('group', { name: /recovery/i })).not.toBeInTheDocument();
  });

  it('shows a primary "Try again" button for RETRY', () => {
    render(
      <TransactionStatus variant="error" network="testnet" mappedError={mappedNetworkError} />,
    );
    const btn = screen.getByRole('button', { name: /resubmit/i });
    expect(btn).toHaveClass('tx-recovery-btn--primary');
    expect(btn).toHaveTextContent('Try again');
  });

  it('shows a primary "Sign again" button for RE_SIGN', () => {
    render(<TransactionStatus variant="error" network="testnet" mappedError={mappedWalletError} />);
    const btn = screen.getByRole('button', { name: /re-open your wallet/i });
    expect(btn).toHaveClass('tx-recovery-btn--primary');
    expect(btn).toHaveTextContent('Sign again');
  });

  it('shows a secondary "Add funds" button for TOP_UP', () => {
    render(
      <TransactionStatus
        variant="error"
        network="testnet"
        mappedError={mappedInsufficientBalance}
      />,
    );
    const btn = screen.getByRole('button', { name: /add xlm/i });
    expect(btn).toHaveClass('tx-recovery-btn--secondary');
    expect(btn).toHaveTextContent('Add funds');
  });

  it('shows a secondary "Switch wallet" button for SWITCH_WALLET', () => {
    render(
      <TransactionStatus variant="error" network="testnet" mappedError={mappedPermissionError} />,
    );
    const btn = screen.getByRole('button', { name: /connect a different wallet/i });
    expect(btn).toHaveClass('tx-recovery-btn--secondary');
    expect(btn).toHaveTextContent('Switch wallet');
  });

  it('shows a secondary "View on explorer" link for VIEW_EXPLORER when a hash is present', () => {
    render(
      <TransactionStatus
        hash={HASH}
        variant="error"
        network="testnet"
        mappedError={mappedContractRevert}
      />,
    );
    const link = screen.getByRole('link', { name: /open the transaction on stellar expert/i });
    expect(link).toHaveClass('tx-recovery-btn--secondary');
    expect(link).toHaveAttribute('href', expect.stringContaining('stellar.expert'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('suppresses the plain explorer link when VIEW_EXPLORER is in recoveryActions', () => {
    render(
      <TransactionStatus
        hash={HASH}
        variant="error"
        network="testnet"
        mappedError={mappedContractRevert}
      />,
    );
    // Only one stellar.expert link should appear — the recovery action one.
    const explorerLinks = screen
      .getAllByRole('link')
      .filter((el) => el.href.includes('stellar.expert'));
    expect(explorerLinks).toHaveLength(1);
  });

  it('shows a ghost "Report issue" link for REPORT', () => {
    render(
      <TransactionStatus variant="error" network="testnet" mappedError={mappedUnknownError} />,
    );
    const link = screen.getByRole('link', { name: /open a support request/i });
    expect(link).toHaveClass('tx-recovery-btn--ghost');
    expect(link).toHaveAttribute('href', expect.stringContaining('github.com'));
  });

  it('renders multiple recovery actions in the correct order', () => {
    render(
      <TransactionStatus variant="error" network="testnet" mappedError={mappedUnknownError} />,
    );
    const group = screen.getByRole('group', { name: /recovery options/i });
    const [first, second] = group.querySelectorAll('.tx-recovery-btn');
    expect(first).toHaveTextContent('Try again');
    expect(second).toHaveTextContent('Report issue');
  });
});

// ── Callback wiring ───────────────────────────────────────────────────────────

describe('TransactionStatus — callback wiring', () => {
  it('calls onRetry when the RETRY button is clicked', async () => {
    const onRetry = vi.fn();
    render(
      <TransactionStatus
        variant="error"
        network="testnet"
        mappedError={mappedNetworkError}
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls onSwitchWallet when the SWITCH_WALLET button is clicked', async () => {
    const onSwitchWallet = vi.fn();
    render(
      <TransactionStatus
        variant="error"
        network="testnet"
        mappedError={mappedPermissionError}
        onSwitchWallet={onSwitchWallet}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /connect a different wallet/i }));
    expect(onSwitchWallet).toHaveBeenCalledTimes(1);
  });

  it('calls onTopUp when the TOP_UP button is clicked', async () => {
    const onTopUp = vi.fn();
    render(
      <TransactionStatus
        variant="error"
        network="testnet"
        mappedError={mappedInsufficientBalance}
        onTopUp={onTopUp}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /add xlm/i }));
    expect(onTopUp).toHaveBeenCalledTimes(1);
  });
});
