/**
 * Trivela API client.
 *
 * Centralises all HTTP calls to the backend: base URL resolution, proxy
 * awareness, consistent error handling, and request timeouts.
 *
 * Usage:
 *   import { apiClient } from './lib/apiClient';
 *   const { data, pagination } = await apiClient.getCampaigns({ sort: 'name' });
 */

import { apiUrl } from '../config';

const DEFAULT_TIMEOUT_MS = 10_000;

class ApiError extends Error {
  /** @param {string} message @param {number} status @param {unknown} [body] */
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Fetch with a timeout. Rejects with an ApiError on non-2xx or timeout.
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * @returns {Promise<unknown>}
 */
async function request(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 0);
    }
    throw new ApiError(err?.message ?? 'Network error', 0);
  } finally {
    clearTimeout(timerId);
  }

  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch {
      /* ignore */
    }
    const message =
      body?.error ?? body?.message ?? `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(message, response.status, body);
  }

  return response.json();
}

// ── Campaign endpoints ────────────────────────────────────────────────────────

/**
 * @param {{
 *   active?: boolean,
 *   q?: string,
 *   page?: number,
 *   limit?: number,
 *   sort?: 'name' | 'created_at' | 'updated_at' | 'reward_per_action' | 'id',
 *   order?: 'asc' | 'desc'
 * }} [params]
 */
async function getCampaigns(params = {}) {
  const qs = new URLSearchParams();
  if (params.active !== undefined) qs.set('active', String(params.active));
  if (params.q) qs.set('q', params.q);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);

  const url = apiUrl('/api/v1/campaigns') + (qs.toString() ? `?${qs}` : '');
  return /** @type {Promise<{ data: any[], pagination: object }>} */ (request(url));
}

/** @param {string | number} id */
async function getCampaignById(id) {
  return request(apiUrl(`/api/v1/campaigns/${id}`));
}

/**
 * @param {string | number} id
 * @param {{ range?: string, from?: string, to?: string }} [params]
 */
async function getCampaignStats(id, params = {}) {
  const qs = new URLSearchParams();
  if (params.range) qs.set('range', params.range);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const url = apiUrl(`/api/v1/campaigns/${id}/stats`) + (qs.toString() ? `?${qs}` : '');
  return request(url);
}

/** @param {string} slug */
async function getCampaignBySlug(slug) {
  return request(apiUrl(`/api/v1/campaigns/by-slug/${encodeURIComponent(slug)}`));
}

/** @param {object} body */
async function createCampaign(body) {
  return request(apiUrl('/api/v1/campaigns'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @param {string | number} id @param {object} body */
async function updateCampaign(id, body) {
  return request(apiUrl(`/api/v1/campaigns/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @param {string | number} id */
async function deleteCampaign(id) {
  return request(apiUrl(`/api/v1/campaigns/${id}`), { method: 'DELETE' });
}

// ── Leaderboard endpoints ─────────────────────────────────────────────────────

/**
 * @param {string | number} campaignId
 * @param {{ page?: number, limit?: number, q?: string }} [params]
 */
async function getCampaignLeaderboard(campaignId, params = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.q) qs.set('q', params.q);
  const url =
    apiUrl(`/api/v1/campaigns/${campaignId}/leaderboard`) + (qs.toString() ? `?${qs}` : '');
  return /** @type {Promise<{ data: any[], pagination: object }>} */ (request(url));
}

/**
 * @param {string | number} campaignId
 * @param {string} walletAddress
 */
async function getParticipantRank(campaignId, walletAddress) {
  const url =
    apiUrl(`/api/v1/campaigns/${campaignId}/leaderboard/rank`) +
    `?wallet=${encodeURIComponent(walletAddress)}`;
  return request(url);
}

// ── Config endpoint ───────────────────────────────────────────────────────────

async function getConfig() {
  return request(apiUrl('/api/v1/config'));
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const apiClient = {
  getCampaigns,
  getCampaignById,
  getCampaignStats,
  getCampaignBySlug,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignLeaderboard,
  getParticipantRank,
  getConfig,
};

export { ApiError };
