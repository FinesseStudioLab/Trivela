/**
 * Button — shared design-system component.
 *
 * Variants: primary | secondary | danger | ghost
 * Sizes:    sm | md | lg
 * States:   default | hover | focus | disabled | loading
 *
 * Accessible:
 *   - Uses a native <button> by default (correct role, keyboard, AT support).
 *   - `aria-busy` is set while loading; a visually-hidden label keeps AT informed.
 *   - `aria-disabled` + `disabled` are both applied when disabled.
 *   - Focus ring driven by :focus-visible (invisible to mouse users).
 *
 * Usage:
 *   <Button variant="primary" size="md" onClick={handleClick}>Save</Button>
 *   <Button variant="danger" loading>Deleting…</Button>
 *   <Button variant="secondary" disabled>Unavailable</Button>
 */

import './tokens.css';
import './Button.css';

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className = '',
  children,
  onClick,
  ...rest
}) {
  const isDisabled = disabled || loading;

  const classes = [
    'ds-btn',
    `ds-btn--${variant}`,
    loading ? 'ds-btn--loading' : '',
    fullWidth ? 'ds-btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      data-size={size}
      disabled={isDisabled}
      aria-disabled={isDisabled ? true : undefined}
      aria-busy={loading ? true : undefined}
      onClick={!isDisabled ? onClick : undefined}
      {...rest}
    >
      {loading && (
        <span className="ds-btn__spinner" aria-hidden="true" />
      )}
      {loading && (
        <span className="ds-visually-hidden">Loading</span>
      )}
      {children}
    </button>
  );
}
