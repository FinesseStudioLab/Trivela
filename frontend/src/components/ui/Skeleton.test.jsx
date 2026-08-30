import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders correctly with default props', () => {
    const { getByTestId } = render(<Skeleton />);
    const element = getByTestId('skeleton');
    expect(element.className).toContain('skeleton');
    expect(element.className).toContain('skeleton--text');
    expect(element.className).toContain('skeleton--wave');
  });

  it('applies the correct variant class', () => {
    const { getByTestId } = render(<Skeleton variant="circular" />);
    const element = getByTestId('skeleton');
    expect(element.className).toContain('skeleton--circular');
  });

  it('applies the correct animation class', () => {
    const { getByTestId } = render(<Skeleton animation="pulse" />);
    const element = getByTestId('skeleton');
    expect(element.className).toContain('skeleton--pulse');
  });

  it('applies inline width and height correctly when strings', () => {
    const { getByTestId } = render(<Skeleton width="100%" height="2rem" />);
    const element = getByTestId('skeleton');
    expect(element.style.width).toBe('100%');
    expect(element.style.height).toBe('2rem');
  });

  it('applies inline width and height correctly when numbers', () => {
    const { getByTestId } = render(<Skeleton width={100} height={50} />);
    const element = getByTestId('skeleton');
    expect(element.style.width).toBe('100px');
    expect(element.style.height).toBe('50px');
  });

  it('accepts additional class names', () => {
    const { getByTestId } = render(<Skeleton className="custom-class" />);
    const element = getByTestId('skeleton');
    expect(element.className).toContain('custom-class');
  });
});
