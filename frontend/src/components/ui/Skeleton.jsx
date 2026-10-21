import React from 'react';
import PropTypes from 'prop-types';
import './Skeleton.css';

/**
 * Skeleton Loader Component
 *
 * Used to indicate loading state while content is being fetched.
 * Provides a shimmering animation effect.
 */
export const Skeleton = ({
  variant = 'text',
  width,
  height,
  className = '',
  animation = 'wave',
  ...props
}) => {
  const classes = ['skeleton', `skeleton--${variant}`, `skeleton--${animation}`, className]
    .filter(Boolean)
    .join(' ');

  const style = {
    ...(width && { width: typeof width === 'number' ? `${width}px` : width }),
    ...(height && { height: typeof height === 'number' ? `${height}px` : height }),
  };

  return (
    <span className={classes} style={style} aria-hidden="true" data-testid="skeleton" {...props} />
  );
};

Skeleton.propTypes = {
  variant: PropTypes.oneOf(['text', 'circular', 'rectangular', 'rounded']),
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  animation: PropTypes.oneOf(['wave', 'pulse', 'none']),
};

export default Skeleton;
