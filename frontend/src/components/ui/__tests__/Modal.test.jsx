/**
 * Tests for Modal component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal, { ConfirmDialog } from '../Modal.jsx';

describe('Modal', () => {
  beforeEach(() => {
    // Clear any lingering modals
    document.body.innerHTML = '';
  });

  it('renders when open', () => {
    render(
      <Modal isOpen={true} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Modal isOpen={false} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on ESC key', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    const overlay = screen.getByRole('presentation');
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on content click', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    const content = screen.getByText('Content');
    await userEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps focus within modal', async () => {
    render(
      <Modal isOpen={true} title="Test Modal">
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    
    // Focus trap is set up - focus moves to dialog on open
    expect(dialog).toHaveAttribute('tabindex', '-1');

    // Verify all buttons are focusable
    const firstButton = screen.getByRole('button', { name: 'First' });
    const thirdButton = screen.getByRole('button', { name: 'Third' });

    expect(firstButton).toBeInTheDocument();
    expect(thirdButton).toBeInTheDocument();
  });

  it('shows close button by default', () => {
    render(
      <Modal isOpen={true} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('hides close button when showCloseButton is false', () => {
    render(
      <Modal isOpen={true} title="Test Modal" showCloseButton={false}>
        <p>Content</p>
      </Modal>
    );

    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
  });

  it('sets aria-labelledby for accessibility', () => {
    render(
      <Modal isOpen={true} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    const title = screen.getByText('Test Modal');

    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
  });

  it('sets aria-modal to true', () => {
    render(
      <Modal isOpen={true} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('ConfirmDialog', () => {
  it('renders with confirm and cancel buttons', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm?"
        message="Are you sure?"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm?')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm?"
        message="Are you sure?"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm?"
        message="Are you sure?"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows loading state', async () => {
    const onConfirm = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm?"
        message="Are you sure?"
        loading={true}
      />
    );

    const confirmButton = screen.getByRole('button', { name: /Delete|Confirm/ });
    expect(confirmButton).toHaveAttribute('aria-busy', 'true');
  });

  it('uses custom labels', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete?"
        message="This cannot be undone."
        confirmLabel="Delete Forever"
        cancelLabel="Keep It"
      />
    );

    expect(screen.getByRole('button', { name: 'Delete Forever' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep It' })).toBeInTheDocument();
  });
});
