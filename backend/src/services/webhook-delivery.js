/**
 * Webhook delivery service with HMAC signing, retries, and dead-letter queue
 * 
 * Implements reliable event delivery to external systems with:
 * - HMAC-SHA256 payload signing for verification
 * - Exponential backoff retry strategy
 * - Dead-letter queue for failed deliveries
 * - Idempotency support
 * - Delivery tracking and metrics
 */

const crypto = require('crypto');
const axios = require('axios');

class WebhookDeliveryService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.initialRetryDelay = options.initialRetryDelay || 1000; // 1 second
    this.maxRetryDelay = options.maxRetryDelay || 300000; // 5 minutes
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.timeout = options.timeout || 10000; // 10 seconds
    this.deadLetterQueue = options.deadLetterQueue || [];
    this.deliveryLog = options.deliveryLog || [];
  }

  /**
   * Generate HMAC signature for payload verification
   * @param {Object} payload - The webhook payload
   * @param {string} secret - The webhook secret
   * @returns {string} HMAC signature
   */
  generateSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   * @param {Object} payload - The received payload
   * @param {string} signature - The received signature
   * @param {string} secret - The webhook secret
   * @returns {boolean} True if signature is valid
   */
  verifySignature(payload, signature, secret) {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attempt) {
    const delay = Math.min(
      this.initialRetryDelay * Math.pow(this.backoffMultiplier, attempt),
      this.maxRetryDelay
    );
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Deliver webhook with retries
   * @param {Object} params - Delivery parameters
   * @param {string} params.url - Webhook URL
   * @param {string} params.secret - Webhook secret for signing
   * @param {Object} params.payload - Event payload
   * @param {string} params.eventType - Event type (e.g., 'campaign.created')
   * @param {string} params.idempotencyKey - Unique key for idempotency
   * @returns {Promise<Object>} Delivery result
   */
  async deliver({ url, secret, payload, eventType, idempotencyKey }) {
    const deliveryId = crypto.randomUUID();
    const timestamp = Date.now();

    const enrichedPayload = {
      event_type: eventType,
      timestamp,
      idempotency_key: idempotencyKey,
      delivery_id: deliveryId,
      data: payload
    };

    const signature = this.generateSignature(enrichedPayload, secret);

    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const response = await axios.post(url, enrichedPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Timestamp': timestamp.toString(),
            'X-Webhook-Delivery-Id': deliveryId,
            'X-Webhook-Event-Type': eventType,
            'X-Webhook-Attempt': attempt.toString(),
            'User-Agent': 'Trivela-Webhook/1.0'
          },
          timeout: this.timeout,
          validateStatus: (status) => status >= 200 && status < 300
        });

        // Success - log and return
        const deliveryRecord = {
          deliveryId,
          url,
          eventType,
          idempotencyKey,
          attempts: attempt + 1,
          status: 'success',
          statusCode: response.status,
          timestamp,
          completedAt: Date.now(),
          duration: Date.now() - timestamp
        };

        this.deliveryLog.push(deliveryRecord);

        return {
          success: true,
          ...deliveryRecord
        };

      } catch (error) {
        lastError = error;
        attempt++;

        // Log failed attempt
        console.warn(`Webhook delivery attempt ${attempt} failed for ${url}:`, {
          error: error.message,
          statusCode: error.response?.status,
          attempt,
          maxRetries: this.maxRetries
        });

        // If we haven't exceeded retries, wait and try again
        if (attempt <= this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted - add to dead-letter queue
    const failureRecord = {
      deliveryId,
      url,
      eventType,
      idempotencyKey,
      payload: enrichedPayload,
      signature,
      attempts: attempt,
      status: 'failed',
      error: lastError.message,
      statusCode: lastError.response?.status,
      timestamp,
      failedAt: Date.now(),
      duration: Date.now() - timestamp
    };

    this.deadLetterQueue.push(failureRecord);
    this.deliveryLog.push(failureRecord);

    return {
      success: false,
      ...failureRecord
    };
  }

  /**
   * Batch deliver webhooks to multiple endpoints
   * @param {Array} webhooks - Array of webhook configurations
   * @param {Object} payload - Event payload
   * @param {string} eventType - Event type
   * @returns {Promise<Array>} Array of delivery results
   */
  async deliverBatch(webhooks, payload, eventType) {
    const idempotencyKey = crypto.randomUUID();
    
    const deliveryPromises = webhooks.map(webhook =>
      this.deliver({
        url: webhook.url,
        secret: webhook.secret,
        payload,
        eventType,
        idempotencyKey: `${idempotencyKey}-${webhook.id}`
      }).catch(error => ({
        success: false,
        error: error.message,
        webhookId: webhook.id
      }))
    );

    return Promise.all(deliveryPromises);
  }

  /**
   * Retry failed deliveries from dead-letter queue
   * @param {number} limit - Maximum number of failures to retry
   * @returns {Promise<Array>} Array of retry results
   */
  async retryFailedDeliveries(limit = 10) {
    const toRetry = this.deadLetterQueue.splice(0, limit);
    
    const retryPromises = toRetry.map(async (failure) => {
      // Extract URL and reconstruct delivery params
      // In production, you'd fetch the webhook config from database
      return this.deliver({
        url: failure.url,
        secret: 'retrieved-from-db', // TODO: Fetch from secure storage
        payload: failure.payload.data,
        eventType: failure.eventType,
        idempotencyKey: `${failure.idempotencyKey}-retry-${Date.now()}`
      });
    });

    return Promise.all(retryPromises);
  }

  /**
   * Get delivery statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const total = this.deliveryLog.length;
    const successful = this.deliveryLog.filter(d => d.status === 'success').length;
    const failed = this.deliveryLog.filter(d => d.status === 'failed').length;
    const inDLQ = this.deadLetterQueue.length;

    const avgDuration = total > 0
      ? this.deliveryLog.reduce((sum, d) => sum + (d.duration || 0), 0) / total
      : 0;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : 'N/A',
      inDeadLetterQueue: inDLQ,
      averageDuration: `${avgDuration.toFixed(0)}ms`
    };
  }

  /**
   * Clear old delivery logs (retention management)
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupOldLogs(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
    const cutoff = Date.now() - maxAge;
    this.deliveryLog = this.deliveryLog.filter(d => d.timestamp > cutoff);
  }
}

/**
 * Example verification function for webhook receivers
 * @param {Object} req - Express request object
 * @param {string} secret - Webhook secret
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(req, secret) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const body = req.body;

  if (!signature || !timestamp) {
    return false;
  }

  // Check timestamp to prevent replay attacks (5 minute window)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  if (Math.abs(now - requestTime) > 300000) { // 5 minutes
    return false;
  }

  const service = new WebhookDeliveryService();
  return service.verifySignature(body, signature, secret);
}

module.exports = {
  WebhookDeliveryService,
  verifyWebhookSignature
};
