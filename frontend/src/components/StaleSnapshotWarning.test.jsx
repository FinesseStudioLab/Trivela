import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StaleSnapshotWarning } from './StaleSnapshotWarning';

describe('StaleSnapshotWarning', () => {
  it('renders nothing when current balance equals snapshot balance', () => {
    const { container } = render(
      <StaleSnapshotWarning snapshotBalance={1000} currentBalance={1000} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when current balance exceeds snapshot balance', () => {
    const { container } = render(
      <StaleSnapshotWarning snapshotBalance={500} currentBalance={800} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders warning banner when current balance is lower than snapshot balance', () => {
    render(<StaleSnapshotWarning snapshotBalance={1000} currentBalance={400} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Stale snapshot detected/i)).toBeInTheDocument();
  });

  it('shows the snapshot and current balance values in the message', () => {
    render(<StaleSnapshotWarning snapshotBalance={2000} currentBalance={750} tokenSymbol="TRV" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('2,000 TRV');
    expect(alert).toHaveTextContent('750 TRV');
  });

  it('uses the provided tokenSymbol in the message', () => {
    render(<StaleSnapshotWarning snapshotBalance={500} currentBalance={100} tokenSymbol="XLM" />);
    expect(screen.getByRole('alert')).toHaveTextContent('XLM');
  });

  it('defaults tokenSymbol to "tokens" when not provided', () => {
    render(<StaleSnapshotWarning snapshotBalance={500} currentBalance={100} />);
    expect(screen.getByRole('alert')).toHaveTextContent('tokens');
  });

  it('works correctly with BigInt balances', () => {
    render(
      <StaleSnapshotWarning
        snapshotBalance={BigInt('9007199254740992')}
        currentBalance={BigInt('1000000')}
        tokenSymbol="TRV"
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies an additional className when provided', () => {
    render(
      <StaleSnapshotWarning
        snapshotBalance={1000}
        currentBalance={500}
        className="my-custom-class"
      />,
    );
    expect(screen.getByRole('alert')).toHaveClass('my-custom-class');
  });
});
