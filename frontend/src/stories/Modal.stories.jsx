import Modal, { ConfirmDialog } from '../components/ui/Modal.jsx';
import { useState } from 'react';

export default {
  title: 'Design System/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Accessible modal dialog following the WAI-ARIA Dialog pattern: focus trap, ESC/overlay close, ' +
          'keyboard navigation, and screen-reader support. Themed through CSS custom properties.',
      },
    },
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'full'] },
    closeOnOverlayClick: { control: 'boolean' },
    closeOnEscape: { control: 'boolean' },
    showCloseButton: { control: 'boolean' },
    onClose: { action: 'closed' },
  },
};

export const Default = {
  args: {
    isOpen: true,
    title: 'Modal Title',
    children: (
      <div>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)' }}>
          This is a modal dialog with focus trapping, ESC/overlay close, and keyboard navigation.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
        </Modal.Actions>
      </div>
    ),
  },
};

export const Small = {
  args: {
    isOpen: true,
    size: 'sm',
    title: 'Confirm Action',
    children: (
      <div>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)' }}>
          This is a small modal for confirmations.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
        </Modal.Actions>
      </div>
    ),
  },
};

export const Large = {
  args: {
    isOpen: true,
    size: 'lg',
    title: 'Campaign Details',
    children: (
      <div>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)' }}>
          This is a large modal for complex content with more information.
        </p>
        <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem' }}>Campaign Info</h4>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Reward: 25 points per action<br />
            Duration: June 1 - Aug 31, 2026<br />
            Category: DeFi
          </p>
        </div>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Close
          </button>
          <button type="button" className="btn btn-primary">
            Edit Campaign
          </button>
        </Modal.Actions>
      </div>
    ),
  },
};

export const DangerConfirm = {
  args: {
    isOpen: true,
    size: 'sm',
    title: 'Delete Campaign?',
    children: (
      <div>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)' }}>
          This action cannot be undone. All campaign data including claims and rewards will be permanently removed.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-danger">
            Delete Campaign
          </button>
        </Modal.Actions>
      </div>
    ),
  },
};

function AsyncConfirmDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setLoading(false);
    setIsOpen(false);
  };

  return (
    <div>
      <button type="button" className="btn btn-danger" onClick={() => setIsOpen(true)}>
        Delete Campaign
      </button>
      <ConfirmDialog
        isOpen={isOpen}
        onClose={() => !loading && setIsOpen(false)}
        onConfirm={handleConfirm}
        title="Delete Campaign?"
        message="This action cannot be undone. The campaign and all associated data will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        loading={loading}
      />
    </div>
  );
}

export const AsyncConfirm = {
  render: () => <AsyncConfirmDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Modal with async confirm state showing a loading indicator while the action is in progress.',
      },
    },
  },
};

function InteractiveDemo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={() => setIsOpen(true)}>
        Open Modal
      </button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Interactive Modal">
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)' }}>
          Try pressing Escape, clicking the overlay, or tabbing through the focusable elements.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <input type="text" placeholder="First focusable element" className="ds-field__input" />
          <input type="text" placeholder="Second focusable element" className="ds-field__input" />
        </div>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary" onClick={() => setIsOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setIsOpen(false)}>
            Confirm
          </button>
        </Modal.Actions>
      </Modal>
    </div>
  );
}

export const Interactive = {
  render: () => <InteractiveDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Interactive modal demonstrating focus trap, ESC close, and overlay click close.',
      },
    },
  },
};

export const LightTheme = {
  args: {
    isOpen: true,
    title: 'Light Theme Modal',
    children: (
      <div>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)' }}>
          Modal automatically adapts to the light theme through CSS custom properties.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
        </Modal.Actions>
      </div>
    ),
  },
  globals: { theme: 'light' },
};
