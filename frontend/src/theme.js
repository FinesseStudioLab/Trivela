export const THEME_STORAGE_KEY = 'trivela-theme';
export const THEME_AUTO = 'auto';

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;

export function resolveAutoTheme(date = new Date()) {
  const hour = date.getHours();
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? 'light' : 'dark';
}

const isTheme = (value) => value === 'light' || value === 'dark' || value === THEME_AUTO;

/** Returns the theme the user explicitly chose (including 'auto'), or null. */
export function getStoredTheme() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

/** Alias kept for callers that use the preference-shaped name. */
export function getThemePreference() {
  return getStoredTheme();
}

/** Returns the operating-system preference (`prefers-color-scheme`), defaulting to dark. */
export function getSystemTheme() {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
}

/** Stored choice first (auto resolves by local time), then the system preference. */
export function getPreferredTheme() {
  const stored = getStoredTheme();
  if (stored === THEME_AUTO) {
    return resolveAutoTheme();
  }
  return stored ?? getSystemTheme();
}

/** Saves an explicit user choice. Storage failures (private mode, quota) are ignored. */
export function persistTheme(theme) {
  if (typeof window === 'undefined' || !isTheme(theme)) {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this session.
  }
}

/**
 * Calls `onChange('light' | 'dark')` whenever the OS preference changes.
 * Returns an unsubscribe function.
 */
export function subscribeToSystemTheme(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const query = window.matchMedia('(prefers-color-scheme: light)');
  const handler = (event) => onChange(event.matches ? 'light' : 'dark');

  if (query.addEventListener) {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }

  query.addListener?.(handler);
  return () => query.removeListener?.(handler);
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
