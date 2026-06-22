import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'trivela:tour_completed';

export function useTour() {
  const [shouldShow, setShouldShow] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    try {
      const completed = window.localStorage.getItem(STORAGE_KEY);
      setShouldShow(!completed);
    } catch {
      setShouldShow(false);
    }
  }, []);

  const markComplete = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // storage unavailable — silently ignore
    }
    setShouldShow(false);
    setIsComplete(true);
  }, []);

  const restartTour = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setShouldShow(true);
    setIsComplete(false);
  }, []);

  return { shouldShow, isComplete, markComplete, restartTour };
}
