import React from 'react';
import { render, screen } from '@testing-library/react';
import { AddressDisplay } from './AddressDisplay';

describe('AddressDisplay', () => {
  const mockAddress = 'GABC1234567890DEFGHIJKLMNOPQRSTUVWXYZ';

  it('renders truncated address', () => {
    render(<AddressDisplay address={mockAddress} truncate={true} />);
    expect(screen.getByText(/GABC12...WXYZ/)).toBeInTheDocument();
  });

  it('renders full address when truncate is false', () => {
    render(<AddressDisplay address={mockAddress} truncate={false} />);
    expect(screen.getByText(mockAddress)).toBeInTheDocument();
  });

  it('shows copy button when enabled', () => {
    render(<AddressDisplay address={mockAddress} showCopy={true} />);
    expect(screen.getByLabelText('Copy address to clipboard')).toBeInTheDocument();
  });

  it('shows explorer link when enabled', () => {
    render(<AddressDisplay address={mockAddress} showExplorerLink={true} />);
    const link = screen.getByLabelText('View address on Stellar Explorer');
    expect(link).toHaveAttribute('href', expect.stringContaining(mockAddress));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('has accessible group role', () => {
    const { container } = render(<AddressDisplay address={mockAddress} />);
    const group = container.querySelector('[role="group"]');
    expect(group).toBeInTheDocument();
  });
});
