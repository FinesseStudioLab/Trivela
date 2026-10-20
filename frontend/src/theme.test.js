import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_AUTO,
  THEME_STORAGE_KEY,
  applyTheme,
  getPreferredTheme,
  getStoredTheme,
  getThemePreference,
  persistTheme,
  resolveAutoTheme,
  subscribeToSystemTheme,
} from './theme';

function mockMatchMedia(prefersLight) {
  const listeners = new Set();
  const query = {
    matches: prefersLight,
    addEventListener: (_event, fn) => listeners.add(fn),
    removeEventListener: (_event, fn) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => query);
  return {
    emit: (matches) => {
      query.matches = matches;
      listeners.forEach((fn) => fn({ matches }));
    },
    listeners,
  };
}

describe('resolveAutoTheme', () => {
  it('returns light during daytime hours (06:00-17:59)', () => {
    expect(resolveAutoTheme(new Date('2024-06-01T12:00:00'))).toBe('light');
    expect(resolveAutoTheme(new Date('2024-06-01T06:00:00'))).toBe('light');
    expect(resolveAutoTheme(new Date('2024-06-01T17:59:00'))).toBe('light');
  });

  it('returns dark during nighttime hours', () => {
    expect(resolveAutoTheme(new Date('2024-06-01T05:59:00'))).toBe('dark');
    expect(resolveAutoTheme(new Date('2024-06-01T18:00:00'))).toBe('dark');
    expect(resolveAutoTheme(new Date('2024-06-01T00:00:00'))).toBe('dark');
    expect(resolveAutoTheme(new Date('2024-06-01T23:30:00'))).toBe('dark');
  });
});

describe('theme persistence and system detection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the OS preference when nothing is stored', () => {
    mockMatchMedia(true);
    expect(getStoredTheme()).toBeNull();
    expect(getPreferredTheme()).toBe('light');

    mockMatchMedia(false);
    expect(getPreferredTheme()).toBe('dark');
  });

  it('prefers a stored choice over the OS preference', () => {
    mockMatchMedia(true);
    persistTheme('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(getPreferredTheme()).toBe('dark');
  });

  it('ignores invalid stored values', () => {
    mockMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getStoredTheme()).toBeNull();
  });

  it('accepts auto as a valid stored preference', () => {
    persistTheme(THEME_AUTO);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEME_AUTO);
    expect(getStoredTheme()).toBe(THEME_AUTO);
    expect(getThemePreference()).toBe(THEME_AUTO);
  });

  it('auto-resolves by local time when auto is stored', () => {
    persistTheme(THEME_AUTO);
    const hour = new Date().getHours();
    const expected = hour >= 6 && hour < 18 ? 'light' : 'dark';
    expect(getPreferredTheme()).toBe(expected);
  });

  it('survives unavailable storage', () => {
    mockMatchMedia(true);
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getPreferredTheme()).toBe('light');
    expect(() => persistTheme('dark')).not.toThrow();
    expect(getThemePreference()).toBeNull();
  });

  it('notifies on OS preference changes and stops after unsubscribe', () => {
    const media = mockMatchMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onChange);

    media.emit(true);
    expect(onChange).toHaveBeenLastCalledWith('light');
    media.emit(false);
    expect(onChange).toHaveBeenLastCalledWith('dark');

    unsubscribe();
    expect(media.listeners.size).toBe(0);
  });

  it('applyTheme sets the data attribute and color scheme', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
