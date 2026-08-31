import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders correctly with default props', () => {
    render(<Toast message="Test message" />);
    const toast = screen.getByTestId('toast');
    expect(toast.className).toContain('toast toast-info');
    expect(screen.getByText('Test message')).toBeTruthy();
  });

  it('renders different types correctly', () => {
    const { rerender } = render(<Toast message="Test" type="success" />);
    expect(screen.getByTestId('toast').className).toContain('toast-success');

    rerender(<Toast message="Test" type="error" />);
    expect(screen.getByTestId('toast').className).toContain('toast-error');
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const handleDismiss = vi.fn();
    render(<Toast message="Test" onDismiss={handleDismiss} />);

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButton);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render dismiss button if onDismiss is not provided', () => {
    render(<Toast message="Test" />);
    const dismissButton = screen.queryByRole('button', { name: /dismiss/i });
    expect(dismissButton).toBeNull();
  });
});
