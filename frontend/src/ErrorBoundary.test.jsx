import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function Boom({ shouldThrow }) {
  if (shouldThrow) throw new Error('kaboom');
  return <p>All good</p>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Hello</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('catches a render error and shows the fallback UI', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/we hit an unexpected error/i)).toBeInTheDocument();
  });

  it('renders the fallback as a <main> landmark by default and a custom tag via the `as` prop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container, unmount } = render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(container.querySelector('main.error-boundary')).toBeInTheDocument();
    unmount();

    render(
      <ErrorBoundary as="div">
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(document.querySelector('div.error-boundary')).toBeInTheDocument();
    expect(document.querySelector('main.error-boundary')).not.toBeInTheDocument();
  });

  it('Retry re-renders children once the error condition clears', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const shouldThrow = { current: true };
    function Flaky() {
      if (shouldThrow.current) throw new Error('kaboom');
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow.current = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('resets automatically when resetKey changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const shouldThrow = { current: true };
    function Flaky() {
      if (shouldThrow.current) throw new Error('kaboom');
      return <p>Recovered</p>;
    }

    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow.current = false;
    rerender(
      <ErrorBoundary resetKey="b">
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('Go home navigates to the site root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const assignSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign: assignSpy });

    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /go home/i }));
    expect(assignSpy).toHaveBeenCalledWith('/');

    vi.unstubAllGlobals();
  });
});
