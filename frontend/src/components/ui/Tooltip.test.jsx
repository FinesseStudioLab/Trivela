// Unit tests for the design-system Tooltip / Popover overlays (issue #980).
// The focus is the accessibility contract: description wiring, keyboard
// reachability, dismissal and focus management.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Tooltip, Popover } from './Tooltip.jsx';

describe('Tooltip', () => {
  it('stays out of the accessibility tree until opened', () => {
    render(
      <Tooltip content="Time-to-live for the ledger entry">
        <button type="button">TTL</button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TTL' })).not.toHaveAttribute('aria-describedby');
  });

  it('opens on hover and describes the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Time-to-live for the ledger entry" openDelay={0} closeDelay={0}>
        <button type="button">TTL</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'TTL' });
    await user.hover(trigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Time-to-live for the ledger entry');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('closes when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Vesting unlocks over time" openDelay={0} closeDelay={0}>
        <button type="button">Vesting</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Vesting' });
    await user.hover(trigger);
    await screen.findByRole('tooltip');

    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('opens on keyboard focus, so it is not mouse-only', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Vesting unlocks over time">
        <button type="button">Vesting</button>
      </Tooltip>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Vesting' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('closes on blur', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Vesting unlocks over time">
          <button type="button">Vesting</button>
        </Tooltip>
        <button type="button">Elsewhere</button>
      </>,
    );

    await user.tab();
    await screen.findByRole('tooltip');

    await user.tab();
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('is dismissable with Escape while the trigger keeps focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Vesting unlocks over time">
        <button type="button">Vesting</button>
      </Tooltip>,
    );

    await user.tab();
    await screen.findByRole('tooltip');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Vesting' })).toHaveFocus();
  });

  it('preserves handlers already on the trigger', async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const onMouseEnter = vi.fn();

    render(
      <Tooltip content="Hint" openDelay={0}>
        <button type="button" onFocus={onFocus} onMouseEnter={onMouseEnter}>
          Trigger
        </button>
      </Tooltip>,
    );

    await user.hover(screen.getByRole('button'));
    expect(onMouseEnter).toHaveBeenCalled();

    await user.tab();
    expect(onFocus).toHaveBeenCalled();
  });

  it('renders the trigger untouched when disabled or contentless', () => {
    const { unmount } = render(
      <Tooltip content="Hint" disabled>
        <button type="button">Plain</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    unmount();

    render(
      <Tooltip content={null}>
        <button type="button">Plain</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('can be opened by default and placed on any edge', () => {
    render(
      <Tooltip content="Hint" placement="right" defaultOpen>
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    expect(screen.getByRole('tooltip')).toHaveClass('ds-overlay--right');
  });
});

describe('Popover', () => {
  const setup = (props = {}) =>
    render(
      <Popover title="Vesting" content={<p>Rewards unlock on a schedule.</p>} {...props}>
        <button type="button">What is vesting?</button>
      </Popover>,
    );

  it('advertises the collapsed dialog on the trigger', () => {
    setup();

    const trigger = screen.getByRole('button', { name: 'What is vesting?' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on click and moves focus into the panel', async () => {
    const user = userEvent.setup();
    setup();

    const trigger = screen.getByRole('button', { name: 'What is vesting?' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Vesting' });
    expect(dialog).toHaveTextContent('Rewards unlock on a schedule.');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', dialog.id);
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    setup();

    const trigger = screen.getByRole('button', { name: 'What is vesting?' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on an outside press', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Popover title="Vesting" content={<p>Body</p>}>
          <button type="button">Open</button>
        </Popover>
        <p data-testid="outside">Outside</p>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays open for clicks inside the panel', async () => {
    const user = userEvent.setup();
    setup({ content: <button type="button">Learn more</button> });

    await user.click(screen.getByRole('button', { name: 'What is vesting?' }));
    await user.click(screen.getByRole('button', { name: 'Learn more' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('can keep an outside press from closing it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Popover title="Vesting" content={<p>Body</p>} closeOnOutsideClick={false}>
          <button type="button">Open</button>
        </Popover>
        <p data-testid="outside">Outside</p>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByTestId('outside'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lets the parent own the open state', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    setup({ open: false, onOpenChange });

    await user.click(screen.getByRole('button', { name: 'What is vesting?' }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
    // Parent did not re-render with open, so nothing opened on its own.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to a generic label when untitled', async () => {
    const user = userEvent.setup();
    render(
      <Popover content={<p>Body</p>}>
        <button type="button">Open</button>
      </Popover>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'More information' })).toBeInTheDocument();
  });
});
