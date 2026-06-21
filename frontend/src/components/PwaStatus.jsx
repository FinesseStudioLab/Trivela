import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './PwaStatus.css';

export default function PwaStatus() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {},
    onRegisterError() {},
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {isOffline ? (
        <div className="pwa-banner pwa-banner-offline" role="status">
          You are offline. Some features may be unavailable until your connection returns.
        </div>
      ) : null}
      {needRefresh ? (
        <div className="pwa-banner pwa-banner-update" role="status">
          <span>Update available — refresh to get the latest version.</span>
          <button
            type="button"
            className="btn btn-secondary pwa-update-btn"
            onClick={() => {
              updateServiceWorker(true);
              setNeedRefresh(false);
            }}
          >
            Refresh now
          </button>
        </div>
      ) : null}
    </>
  );
}
