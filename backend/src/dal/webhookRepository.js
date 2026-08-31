/**
 * Webhook Repository
 * Manages webhook subscriptions for campaign events
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} Webhook
 * @property {string} id - Unique webhook ID
 * @property {string} url - Webhook endpoint URL
 * @property {string} secret - HMAC secret for signature verification
 * @property {string[]} events - Array of event types to subscribe to
 * @property {boolean} active - Whether webhook is active
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {Object} WebhookDelivery
 * @property {string} id - Unique delivery ID
 * @property {string} webhookId - Reference to webhook
 * @property {string} event - Event type
 * @property {unknown} payload - Event payload
 * @property {number} statusCode - HTTP response status
 * @property {string} error - Error message if failed
 * @property {number} attempts - Number of delivery attempts
 * @property {string} nextRetryAt - ISO timestamp for next retry
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

export class WebhookRepository {
  /**
   * @param {import('./index.js').Database} db
   */
  constructor(db) {
    this.db = db;
    this.webhooks = new Map();
    this.deliveries = new Map();
  }

  /**
   * Create a new webhook subscription
   * @param {Object} data
   * @param {string} data.url
   * @param {string[]} data.events
   * @param {string} [data.secret]
   * @returns {Webhook}
   */
  create({ url, events, secret }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const webhook = {
      id,
      url,
      secret: secret || randomUUID(),
      events: Array.isArray(events) ? events : [],
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.webhooks.set(id, webhook);
    return webhook;
  }

  /**
   * Get webhook by ID
   * @param {string} id
   * @returns {Webhook | null}
   */
  getById(id) {
    return this.webhooks.get(id) || null;
  }

  /**
   * List all webhooks
   * @param {Object} [filters]
   * @param {boolean} [filters.active]
   * @returns {Webhook[]}
   */
  list(filters = {}) {
    let webhooks = Array.from(this.webhooks.values());
    if (filters.active !== undefined) {
      webhooks = webhooks.filter((w) => w.active === filters.active);
    }
    return webhooks;
  }

  /**
   * Update webhook
   * @param {string} id
   * @param {Partial<Webhook>} updates
   * @returns {Webhook | null}
   */
  update(id, updates) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;
    const updated = {
      ...webhook,
      ...updates,
      id: webhook.id,
      createdAt: webhook.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.webhooks.set(id, updated);
    return updated;
  }

  /**
   * Delete webhook
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    return this.webhooks.delete(id);
  }

  /**
   * Record a webhook delivery attempt
   * @param {Object} data
   * @param {string} data.webhookId
   * @param {string} data.event
   * @param {unknown} data.payload
   * @param {number} data.statusCode
   * @param {string} [data.error]
   * @returns {WebhookDelivery}
   */
  recordDelivery({ webhookId, event, payload, statusCode, error }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const delivery = {
      id,
      webhookId,
      event,
      payload,
      statusCode,
      error: error || null,
      attempts: 1,
      nextRetryAt: statusCode >= 400 ? new Date(Date.now() + 60000).toISOString() : null,
      createdAt: now,
      updatedAt: now,
    };
    this.deliveries.set(id, delivery);
    return delivery;
  }

  /**
   * Get delivery by ID
   * @param {string} id
   * @returns {WebhookDelivery | null}
   */
  getDeliveryById(id) {
    return this.deliveries.get(id) || null;
  }

  /**
   * List deliveries for a webhook
   * @param {string} webhookId
   * @param {Object} [filters]
   * @param {number} [filters.limit]
   * @returns {WebhookDelivery[]}
   */
  listDeliveries(webhookId, filters = {}) {
    const limit = filters.limit || 100;
    return Array.from(this.deliveries.values())
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get pending retries
   * @returns {WebhookDelivery[]}
   */
  getPendingRetries() {
    const now = new Date();
    return Array.from(this.deliveries.values()).filter(
      (d) => d.nextRetryAt && new Date(d.nextRetryAt) <= now && d.attempts < 5,
    );
  }

  /**
   * Update delivery attempt
   * @param {string} id
   * @param {Object} updates
   * @returns {WebhookDelivery | null}
   */
  updateDelivery(id, updates) {
    const delivery = this.deliveries.get(id);
    if (!delivery) return null;
    const updated = {
      ...delivery,
      ...updates,
      id: delivery.id,
      webhookId: delivery.webhookId,
      createdAt: delivery.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.deliveries.set(id, updated);
    return updated;
  }
}
