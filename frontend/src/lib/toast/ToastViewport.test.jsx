import { act, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider';
import ToastViewport from './ToastViewport';

function Harness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success('Saved', { duration: 0 })}>
        show success
      </button>
      <button type="button" onClick={() => toast.error('Broke', { duration: 0 })}>
        show error
      </button>
      <ToastViewport />
    </>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe('ToastViewport', () => {
  it('renders nothing when there are no toasts', () => {
    renderHarness();
    expect(screen.queryByLabelText('Notifications')).not.toBeInTheDocument();
  });

  it('renders a success toast with role="status" and an error toast with role="alert"', () => {
    renderHarness();

    act(() => {
      screen.getByRole('button', { name: /show success/i }).click();
      screen.getByRole('button', { name: /show error/i }).click();
    });

    expect(screen.getByText('Saved').closest('[role="status"]')).toBeInTheDocument();
    expect(screen.getByText('Broke').closest('[role="alert"]')).toBeInTheDocument();
  });

  it('dismiss button removes the toast', () => {
    renderHarness();

    act(() => {
      screen.getByRole('button', { name: /show success/i }).click();
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: /dismiss notification/i }).click();
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('stacks multiple toasts', () => {
    renderHarness();

    act(() => {
      screen.getByRole('button', { name: /show success/i }).click();
      screen.getByRole('button', { name: /show error/i }).click();
    });

    expect(screen.getAllByRole('button', { name: /dismiss notification/i })).toHaveLength(2);
  });
});
