import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from '../locales/en.js';
import zhCN from '../locales/zh-CN.js';

const LOCALES = { en, 'zh-CN': zhCN };
const STORAGE_KEY = 'trivela_locale';
const SUPPORTED = Object.keys(LOCALES);

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {
    // localStorage unavailable
  }
  const browser = navigator.language ?? 'en';
  if (browser.startsWith('zh')) return 'zh-CN';
  return 'en';
}

const I18nContext = createContext({ locale: 'en', setLocale: () => {}, t: (k) => k });

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  const setLocale = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key, fallback) => {
      const dict = LOCALES[locale] ?? en;
      return dict[key] ?? en[key] ?? fallback ?? key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, supported: SUPPORTED }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export { SUPPORTED as SUPPORTED_LOCALES };
