// Unit tests for the design-system Button component (issue #969).
// Covers all variants, sizes, states (disabled, loading) and accessibility.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Button from './Button.jsx';

describe('Button', () => {
  // — rendering —
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders with default type="button"', () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('renders with type="submit" when specified', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  // — variants —
  it('applies primary variant class by default', () => {
    render(<Button>Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn--primary');
  });

  it('applies secondary variant class', () => {
    render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn--secondary');
  });

  it('applies danger variant class', () => {
    render(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn--danger');
  });

  it('applies ghost variant class', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn--ghost');
  });

  // — sizes —
  it('applies md size by default', () => {
    render(<Button>Medium</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'md');
  });

  it('applies sm size', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'sm');
  });

  it('applies lg size', () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'lg');
  });

  // — disabled state —
  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('sets aria-disabled when disabled', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  // — loading state —
  it('shows spinner when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button').querySelector('.ds-btn__spinner')).toBeInTheDocument();
  });

  it('sets aria-busy when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('is disabled when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onClick when loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies loading class when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn--loading');
  });

  // — click handler —
  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // — fullWidth —
  it('applies full width class when fullWidth is true', () => {
    render(<Button fullWidth>Full</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn--full');
  });

  // — custom className —
  it('merges custom className', () => {
    render(<Button className="my-custom">Custom</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn', 'my-custom');
  });

  // — keyboard accessibility —
  it('is keyboard accessible with Enter key', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press me</Button>);
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is keyboard accessible with Space key', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press me</Button>);
    screen.getByRole('button').focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // — base class —
  it('always has the ds-btn base class', () => {
    render(<Button>Base</Button>);
    expect(screen.getByRole('button')).toHaveClass('ds-btn');
  });
});
