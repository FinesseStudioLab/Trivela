/**
 * Webhook Service
 * Handles webhook delivery and event dispatching
 */

import crypto from 'node:crypto';

const WEBHOOK_EVENTS = {
  CAMPAIGN_CREATED: 'campaign.created',
  CAMPAIGN_UPDATED: 'campaign.updated',
  CAMPAIGN_DELETED: 'campaign.deleted',
  CAMPAIGN_ACTIVATED: 'campaign.activated',
  CAMPAIGN_DEACTIVATED: 'campaign.deactivated',
};

/**
 * @typedef {Object} WebhookEvent
 * @property {string} type - Event type
 * @property {string} campaignId - Campaign ID
 * @property {unknown} data - Event data
 * @property {string} timestamp - ISO timestamp
 */

export class WebhookService {
  /**
   * @param {import('../dal/webhookRepository.js').WebhookRepository} webhookRepository
   * @param {Object} options
   * @param {typeof fetch} [options.fetchImpl]
   * @param {Object} [options.logger]
   */
  constructor(webhookRepository, options = {}) {
    this.webhookRepository = webhookRepository;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.logger = options.logger || console;
  }

  /**
   * Generate HMAC signature for webhook payload
   * @param {string} secret
   * @param {string} payload
   * @returns {string}
   */
  generateSignature(secret, payload) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   * @param {string} signature
   * @param {string} secret
   * @param {string} payload
   * @returns {boolean}
   */
  verifySignature(signature, secret, payload) {
    const expected = this.generateSignature(secret, payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }

  /**
   * Dispatch event to all subscribed webhooks
   * @param {WebhookEvent} event
   * @returns {Promise<void>}
   */
  async dispatchEvent(event) {
    const webhooks = this.webhookRepository.list({ active: true });
    const subscribedWebhooks = webhooks.filter((w) =>
      w.events.includes(event.type),
    );

    for (const webhook of subscribedWebhooks) {
      await this.deliverWebhook(webhook, event);
    }
  }

  /**
   * Deliver webhook to endpoint
   * @param {import('../dal/webhookRepository.js').Webhook} webhook
   * @param {WebhookEvent} event
   * @returns {Promise<void>}
   */
  async deliverWebhook(webhook, event) {
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      type: event.type,
      timestamp: event.timestamp,
      data: event.data,
    });

    const signature = this.generateSignature(webhook.secret, payload);

    try {
      const response = await this.fetchImpl(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trivela-Signature': signature,
          'X-Trivela-Event': event.type,
          'X-Trivela-Timestamp': event.timestamp,
        },
        body: payload,
        timeout: 10000,
      });

      const statusCode = response.status;
      const success = statusCode >= 200 && statusCode < 300;

      this.webhookRepository.recordDelivery({
        webhookId: webhook.id,
        event: event.type,
        payload: event.data,
        statusCode,
        error: success ? null : `HTTP ${statusCode}`,
      });

      if (!success) {
        this.logger.warn(
          { webhookId: webhook.id, statusCode, event: event.type },
          'Webhook delivery failed',
        );
      }
    } catch (error) {
      this.logger.error(
        { webhookId: webhook.id, error, event: event.type },
        'Webhook delivery error',
      );

      this.webhookRepository.recordDelivery({
        webhookId: webhook.id,
        event: event.type,
        payload: event.data,
        statusCode: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Retry failed deliveries
   * @returns {Promise<void>}
   */
  async retryFailedDeliveries() {
    const pending = this.webhookRepository.getPendingRetries();

    for (const delivery of pending) {
      const webhook = this.webhookRepository.getById(delivery.webhookId);
      if (!webhook) continue;

      const event = {
        type: delivery.event,
        data: delivery.payload,
        timestamp: new Date().toISOString(),
      };

      try {
        const response = await this.fetchImpl(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Trivela-Signature': this.generateSignature(
              webhook.secret,
              JSON.stringify(event),
            ),
            'X-Trivela-Event': delivery.event,
            'X-Trivela-Timestamp': event.timestamp,
            'X-Trivela-Retry-Attempt': String(delivery.attempts + 1),
          },
          body: JSON.stringify(event),
          timeout: 10000,
        });

        const statusCode = response.status;
        const success = statusCode >= 200 && statusCode < 300;

        if (success) {
          this.webhookRepository.updateDelivery(delivery.id, {
            statusCode,
            error: null,
            nextRetryAt: null,
          });
        } else {
          const nextRetryMs = Math.min(60000 * Math.pow(2, delivery.attempts), 3600000);
          this.webhookRepository.updateDelivery(delivery.id, {
            statusCode,
            error: `HTTP ${statusCode}`,
            attempts: delivery.attempts + 1,
            nextRetryAt: new Date(Date.now() + nextRetryMs).toISOString(),
          });
        }
      } catch (error) {
        const nextRetryMs = Math.min(60000 * Math.pow(2, delivery.attempts), 3600000);
        this.webhookRepository.updateDelivery(delivery.id, {
          statusCode: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
          attempts: delivery.attempts + 1,
          nextRetryAt: new Date(Date.now() + nextRetryMs).toISOString(),
        });
      }
    }
  }
}

export { WEBHOOK_EVENTS };
