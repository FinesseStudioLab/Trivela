/**
 * Minimal fetch-based HTTP helpers for the Trivela REST API.
 *
 * Deliberately framework-free: works in Node >= 18, browsers, workers,
 * and any runtime that provides global `fetch`.
 */

export interface TrivelaClientConfig {
  /** Base URL of the Trivela API, e.g. `https://api.trivela.network`. */
  baseUrl: string;
  /** Optional API key sent as `X-API-Key`. */
  apiKey?: string;
  /** Optional custom fetch implementation (useful for tests). */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class TrivelaHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'TrivelaHttpError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Lightweight REST client for the Trivela API.
 *
 * No React, no bundler assumptions, no polyfills required beyond `fetch`.
 */
export function createClient(config: TrivelaClientConfig) {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime; pass config.fetchImpl');
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, signal } = options;

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : null) || `HTTP ${response.status}`;
      const code =
        payload && typeof payload === 'object' && 'code' in payload
          ? String((payload as { code: unknown }).code)
          : undefined;
      throw new TrivelaHttpError(response.status, message, code);
    }

    return payload as T;
  }

  return {
    /** Underlying request primitive. */
    request,
    /** GET helper. */
    get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'GET' });
    },
    /** POST helper. */
    post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'POST', body });
    },
    /** PUT helper. */
    put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'PUT', body });
    },
    /** DELETE helper. */
    del<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'DELETE' });
    },
  };
}

export type TrivelaClient = ReturnType<typeof createClient>;
