// React hook for Web Push subscription management (issue #619).
//
// Wraps the browser Push API: requests permission, subscribes via the VAPID
// public key served by the backend, and registers/removes the subscription
// through the `/push` endpoints. Degrades gracefully where push is unsupported.

import { useCallback, useEffect, useState } from 'react';

/** Convert a base64url VAPID key to the Uint8Array the Push API expects. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * @param {object} params
 * @param {string} params.user - account the subscription belongs to
 * @param {string} [params.apiBase] - API prefix (default `/api/v1`)
 * @param {typeof fetch} [params.fetchImpl] - injectable for tests
 */
export function usePushNotifications({ user, apiBase = '/api/v1', fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const supported = pushSupported();

  const [permission, setPermission] = useState(() =>
    supported ? Notification.permission : 'default',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Reflect any existing subscription on mount.
  useEffect(() => {
    if (!supported) return undefined;
    let active = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setSubscribed(Boolean(sub));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!supported || !doFetch) {
      setError('unsupported');
      return false;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await doFetch(`${apiBase}/push/vapid-public-key`);
      if (!keyRes.ok) throw new Error('vapid_key_unavailable');
      const { publicKey } = await keyRes.json();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await doFetch(`${apiBase}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, subscription: subscription.toJSON() }),
      });
      if (!res.ok) throw new Error('subscribe_failed');

      setSubscribed(true);
      return true;
    } catch (err) {
      setError(err.message || 'subscribe_error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, doFetch, apiBase, user]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    if (!supported || !doFetch) return false;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await doFetch(`${apiBase}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch (err) {
      setError(err.message || 'unsubscribe_error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, doFetch, apiBase]);

  return { supported, permission, subscribed, busy, error, subscribe, unsubscribe };
}
