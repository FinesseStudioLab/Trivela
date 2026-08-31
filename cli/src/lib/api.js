/**
 * Lightweight API helper for the Trivela REST backend.
 */

import fetch from 'node-fetch';

export class ApiClient {
  constructor({ apiUrl, apiKey }) {
    this.baseUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  _headers() {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    return h;
  }

  async request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this._headers(),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.error ?? msg;
      } catch {}
      throw new Error(`API error ${res.status}: ${msg}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }
}
