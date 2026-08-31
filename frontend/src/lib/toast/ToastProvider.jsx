import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({
  toasts: [],
  show: () => '',
  success: () => '',
  error: () => '',
  info: () => '',
  dismiss: () => {},
});

const DEFAULT_DURATION_MS = 5000;

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message, { type = 'info', duration = DEFAULT_DURATION_MS } = {}) => {
      const id = `toast-${(nextId += 1)}`;
      setToasts((current) => [...current, { id, message, type }]);

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  const success = useCallback(
    (message, opts) => show(message, { ...opts, type: 'success' }),
    [show],
  );
  const error = useCallback((message, opts) => show(message, { ...opts, type: 'error' }), [show]);
  const info = useCallback((message, opts) => show(message, { ...opts, type: 'info' }), [show]);

  const value = useMemo(
    () => ({ toasts, show, success, error, info, dismiss }),
    [toasts, show, success, error, info, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}
