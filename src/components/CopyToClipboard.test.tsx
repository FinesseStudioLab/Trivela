import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopyToClipboard } from './CopyToClipboard';

describe('CopyToClipboard', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  it('renders with label', () => {
    render(<CopyToClipboard text="test" label="Copy" />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('copies text on click', async () => {
    render(<CopyToClipboard text="test-value" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-value');
  });

  it('is keyboard accessible', () => {
    render(<CopyToClipboard text="test" />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('tabIndex', '0');
  });
});
