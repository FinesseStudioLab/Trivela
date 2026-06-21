// @vitest-environment jsdom
// Tests for the usePushNotifications hook (issue #619).

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { usePushNotifications, urlBase64ToUint8Array } from './usePushNotifications';

function installPushEnv({ existingSub = null, requestResult = 'granted' } = {}) {
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p256', auth: 'auth' },
    }),
    unsubscribe: vi.fn(async () => true),
  };
  const pushManager = {
    getSubscription: vi.fn(async () => existingSub),
    subscribe: vi.fn(async () => subscription),
  };
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  globalThis.PushManager = function PushManager() {};
  globalThis.Notification = {
    permission: 'default',
    requestPermission: vi.fn(async () => requestResult),
  };
  return { subscription, pushManager };
}

function makeFetch() {
  return vi.fn(async (url) => {
    if (String(url).endsWith('/push/vapid-public-key')) {
      return {
        ok: true,
        json: async () => ({
          publicKey:
            'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8',
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
}

afterEach(() => {
  delete globalThis.PushManager;
  delete globalThis.Notification;
  delete globalThis.navigator.serviceWorker;
  vi.restoreAllMocks();
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key to bytes', () => {
    const bytes = urlBase64ToUint8Array('AAAA');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(3);
  });
});

describe('usePushNotifications', () => {
  it('reports unsupported when the Push API is missing', () => {
    const { result } = renderHook(() => usePushNotifications({ user: 'alice' }));
    expect(result.current.supported).toBe(false);
  });

  it('subscribes: requests permission, fetches the key, and posts the subscription', async () => {
    const { pushManager } = installPushEnv();
    const fetchImpl = makeFetch();
    const { result } = renderHook(() => usePushNotifications({ user: 'alice', fetchImpl }));

    expect(result.current.supported).toBe(true);

    let ok;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(true);
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    const postCall = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/push/subscribe'));
    expect(postCall).toBeTruthy();
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      user: 'alice',
      subscription: { endpoint: 'https://push.example/abc' },
    });
    await waitFor(() => expect(result.current.subscribed).toBe(true));
  });

  it('does not subscribe when permission is denied', async () => {
    installPushEnv({ requestResult: 'denied' });
    const fetchImpl = makeFetch();
    const { result } = renderHook(() => usePushNotifications({ user: 'alice', fetchImpl }));

    let ok;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(false);
    expect(result.current.subscribed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the subscription server-side and locally', async () => {
    const { subscription } = installPushEnv({ existingSub: undefined });
    const pm = (await globalThis.navigator.serviceWorker.ready).pushManager;
    pm.getSubscription = vi.fn(async () => subscription);
    const fetchImpl = makeFetch();
    const { result } = renderHook(() => usePushNotifications({ user: 'alice', fetchImpl }));

    await act(async () => {
      await result.current.unsubscribe();
    });

    const unsubCall = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/push/unsubscribe'));
    expect(unsubCall).toBeTruthy();
    expect(JSON.parse(unsubCall[1].body)).toEqual({ endpoint: 'https://push.example/abc' });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.subscribed).toBe(false));
  });
});
