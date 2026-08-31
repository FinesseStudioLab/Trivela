// Unit tests for the design-system Tabs component (issue #979).
// Covers the WAI-ARIA Tabs pattern: wiring, roving tabindex, keyboard
// navigation, disabled handling and both activation modes.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Tabs, { nextEnabledIndex } from './Tabs.jsx';

const ITEMS = [
  { id: 'overview', label: 'Overview', content: <p>Overview panel</p> },
  { id: 'rewards', label: 'Rewards', content: <p>Rewards panel</p> },
  { id: 'audit', label: 'Audit', content: <p>Audit panel</p> },
];

describe('nextEnabledIndex', () => {
  const items = [{ disabled: false }, { disabled: true }, { disabled: false }];

  it('skips disabled entries when moving forward', () => {
    expect(nextEnabledIndex(items, 0, 1)).toBe(2);
  });

  it('skips disabled entries when moving backward', () => {
    expect(nextEnabledIndex(items, 2, -1)).toBe(0);
  });

  it('wraps around both ends', () => {
    expect(nextEnabledIndex(items, 2, 1)).toBe(0);
    expect(nextEnabledIndex(items, 0, -1)).toBe(2);
  });

  it('stays put when every other entry is disabled', () => {
    expect(nextEnabledIndex([{ disabled: false }, { disabled: true }], 0, 1)).toBe(0);
  });

  it('returns -1 for an empty list', () => {
    expect(nextEnabledIndex([], 0, 1)).toBe(-1);
  });
});

describe('Tabs', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<Tabs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('wires each tab to its panel with the ARIA id pair', () => {
    render(<Tabs items={ITEMS} label="Campaign sections" />);

    const tablist = screen.getByRole('tablist', { name: 'Campaign sections' });
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const selected = screen.getByRole('tab', { name: 'Overview' });
    const panel = screen.getByRole('tabpanel');

    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', selected.id);
    expect(panel).toHaveTextContent('Overview panel');
  });

  it('selects the first tab by default and honours defaultValue', () => {
    const { unmount } = render(<Tabs items={ITEMS} />);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Overview');
    unmount();

    render(<Tabs items={ITEMS} defaultValue="audit" />);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Audit');
  });

  it('exposes a single tab stop via roving tabindex', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    const [overview, rewards, audit] = screen.getAllByRole('tab');
    expect(overview).toHaveAttribute('tabindex', '0');
    expect(rewards).toHaveAttribute('tabindex', '-1');
    expect(audit).toHaveAttribute('tabindex', '-1');

    await user.click(rewards);
    expect(rewards).toHaveAttribute('tabindex', '0');
    expect(overview).toHaveAttribute('tabindex', '-1');
  });

  it('switches panels on click and reports the change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Rewards' }));

    expect(onChange).toHaveBeenCalledWith('rewards', 1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Rewards panel');
  });

  it('moves between tabs with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    const [overview, rewards, audit] = screen.getAllByRole('tab');
    overview.focus();

    await user.keyboard('{ArrowRight}');
    expect(rewards).toHaveFocus();
    expect(rewards).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(overview).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(audit).toHaveFocus();
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} defaultValue="rewards" />);

    const [overview, , audit] = screen.getAllByRole('tab');
    screen.getByRole('tab', { name: 'Rewards' }).focus();

    await user.keyboard('{End}');
    expect(audit).toHaveFocus();

    await user.keyboard('{Home}');
    expect(overview).toHaveFocus();
  });

  it('uses up/down arrows when vertical', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} orientation="vertical" />);

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');

    const [overview, rewards] = screen.getAllByRole('tab');
    overview.focus();

    await user.keyboard('{ArrowDown}');
    expect(rewards).toHaveFocus();

    // Horizontal keys must not steal the event in vertical orientation.
    await user.keyboard('{ArrowRight}');
    expect(rewards).toHaveFocus();
  });

  it('skips disabled tabs and refuses to select them', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items = [ITEMS[0], { ...ITEMS[1], disabled: true }, ITEMS[2]];
    render(<Tabs items={items} onChange={onChange} />);

    const [overview, rewards, audit] = screen.getAllByRole('tab');
    expect(rewards).toBeDisabled();

    overview.focus();
    await user.keyboard('{ArrowRight}');
    expect(audit).toHaveFocus();

    await user.click(rewards);
    expect(onChange).not.toHaveBeenCalledWith('rewards', 1);
  });

  it('defers selection until Enter/Space when activation is manual', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} activation="manual" onChange={onChange} />);

    const [overview, rewards] = screen.getAllByRole('tab');
    overview.focus();

    await user.keyboard('{ArrowRight}');
    expect(rewards).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Overview panel');

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('rewards', 1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Rewards panel');
  });

  it('respects the controlled value and does not self-select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="audit" onChange={onChange} />);

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Audit');

    await user.click(screen.getByRole('tab', { name: 'Overview' }));

    expect(onChange).toHaveBeenCalledWith('overview', 0);
    // Parent owns the value, so the rendered selection is unchanged.
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Audit');
  });

  it('renders optional icons and badges without exposing them to AT twice', () => {
    render(<Tabs items={[{ id: 'a', label: 'Alerts', icon: '🔔', badge: 3, content: null }]} />);

    const tab = screen.getByRole('tab');
    expect(tab).toHaveTextContent('Alerts');
    expect(tab).toHaveTextContent('3');
    expect(tab.querySelector('.ds-tabs__icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies the variant, orientation and size hooks used for theming', () => {
    const { container } = render(
      <Tabs items={ITEMS} variant="pill" orientation="vertical" size="sm" />,
    );

    const root = container.querySelector('.ds-tabs');
    expect(root).toHaveClass('ds-tabs--pill', 'ds-tabs--vertical');
    expect(root).toHaveAttribute('data-size', 'sm');
  });
});
