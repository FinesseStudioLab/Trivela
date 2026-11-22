const { WebhookDeliveryService, verifyWebhookSignature } = require('./webhook-delivery');
const nock = require('nock');
const crypto = require('crypto');

describe('WebhookDeliveryService', () => {
  let service;

  beforeEach(() => {
    service = new WebhookDeliveryService({
      maxRetries: 3,
      initialRetryDelay: 100,
      timeout: 5000
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('generateSignature', () => {
    it('should generate consistent HMAC signature', () => {
      const payload = { data: 'test' };
      const secret = 'test-secret';
      
      const sig1 = service.generateSignature(payload, secret);
      const sig2 = service.generateSignature(payload, secret);
      
      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test-secret';
      const sig1 = service.generateSignature({ data: 'test1' }, secret);
      const sig2 = service.generateSignature({ data: 'test2' }, secret);
      
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = { data: 'test' };
      const sig1 = service.generateSignature(payload, 'secret1');
      const sig2 = service.generateSignature(payload, 'secret2');
      
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const payload = { data: 'test' };
      const secret = 'test-secret';
      const signature = service.generateSignature(payload, secret);
      
      expect(service.verifySignature(payload, signature, secret)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = { data: 'test' };
      const secret = 'test-secret';
      const wrongSignature = 'a'.repeat(64);
      
      expect(service.verifySignature(payload, wrongSignature, secret)).toBe(false);
    });

    it('should reject tampered payload', () => {
      const originalPayload = { data: 'original' };
      const tamperedPayload = { data: 'tampered' };
      const secret = 'test-secret';
      const signature = service.generateSignature(originalPayload, secret);
      
      expect(service.verifySignature(tamperedPayload, signature, secret)).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should increase delay exponentially', () => {
      const delay0 = service.calculateRetryDelay(0);
      const delay1 = service.calculateRetryDelay(1);
      const delay2 = service.calculateRetryDelay(2);
      
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should respect max delay', () => {
      const service2 = new WebhookDeliveryService({
        maxRetryDelay: 5000
      });
      
      const delay = service2.calculateRetryDelay(100); // Very high attempt
      expect(delay).toBeLessThanOrEqual(5000 * 1.3); // Max + jitter
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = Array.from({ length: 10 }, () => service.calculateRetryDelay(2));
      const uniqueDelays = new Set(delays);
      
      // Should have some variation due to jitter
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('deliver', () => {
    const webhookUrl = 'https://example.com/webhook';
    const webhookSecret = 'test-secret';
    const payload = { campaign_id: 'camp-123', status: 'active' };
    const eventType = 'campaign.created';

    it('should successfully deliver webhook on first attempt', async () => {
      nock('https://example.com')
        .post('/webhook')
        .reply(200, { received: true });

      const result = await service.deliver({
        url: webhookUrl,
        secret: webhookSecret,
        payload,
        eventType,
        idempotencyKey: 'test-key-1'
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.status).toBe('success');
      expect(result.deliveryId).toBeDefined();
      expect(service.deliveryLog).toHaveLength(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      nock('https://example.com')
        .post('/webhook')
        .twice()
        .reply(500, { error: 'Server error' })
        .post('/webhook')
        .reply(200, { received: true });

      const result = await service.deliver({
        url: webhookUrl,
        secret: webhookSecret,
        payload,
        eventType,
        idempotencyKey: 'test-key-2'
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should add to DLQ after max retries exhausted', async () => {
      nock('https://example.com')
        .post('/webhook')
        .times(4) // Initial + 3 retries
        .reply(500, { error: 'Persistent failure' });

      const result = await service.deliver({
        url: webhookUrl,
        secret: webhookSecret,
        payload,
        eventType,
        idempotencyKey: 'test-key-3'
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(service.deadLetterQueue).toHaveLength(1);
      expect(service.deadLetterQueue[0].attempts).toBe(4);
    });

    it('should include correct headers', async () => {
      let receivedHeaders;

      nock('https://example.com')
        .post('/webhook')
        .reply(function() {
          receivedHeaders = this.req.headers;
          return [200, { received: true }];
        });

      await service.deliver({
        url: webhookUrl,
        secret: webhookSecret,
        payload,
        eventType,
        idempotencyKey: 'test-key-4'
      });

      expect(receivedHeaders['x-webhook-signature']).toBeDefined();
      expect(receivedHeaders['x-webhook-timestamp']).toBeDefined();
      expect(receivedHeaders['x-webhook-delivery-id']).toBeDefined();
      expect(receivedHeaders['x-webhook-event-type']).toBe(eventType);
      expect(receivedHeaders['user-agent']).toBe('Trivela-Webhook/1.0');
    });

    it('should handle network timeouts', async () => {
      nock('https://example.com')
        .post('/webhook')
        .delay(10000) // Delay longer than timeout
        .reply(200);

      const result = await service.deliver({
        url: webhookUrl,
        secret: webhookSecret,
        payload,
        eventType,
        idempotencyKey: 'test-key-5'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('deliverBatch', () => {
    it('should deliver to multiple webhooks in parallel', async () => {
      const webhooks = [
        { id: 'wh1', url: 'https://webhook1.com/endpoint', secret: 'secret1' },
        { id: 'wh2', url: 'https://webhook2.com/endpoint', secret: 'secret2' }
      ];

      nock('https://webhook1.com').post('/endpoint').reply(200);
      nock('https://webhook2.com').post('/endpoint').reply(200);

      const results = await service.deliverBatch(
        webhooks,
        { data: 'test' },
        'test.event'
      );

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle partial failures in batch', async () => {
      const webhooks = [
        { id: 'wh1', url: 'https://webhook1.com/endpoint', secret: 'secret1' },
        { id: 'wh2', url: 'https://webhook2.com/endpoint', secret: 'secret2' }
      ];

      nock('https://webhook1.com').post('/endpoint').reply(200);
      nock('https://webhook2.com').post('/endpoint').times(4).reply(500);

      const results = await service.deliverBatch(
        webhooks,
        { data: 'test' },
        'test.event'
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should calculate correct statistics', async () => {
      // Successful delivery
      nock('https://example.com').post('/webhook').reply(200);
      await service.deliver({
        url: 'https://example.com/webhook',
        secret: 'secret',
        payload: { test: true },
        eventType: 'test',
        idempotencyKey: 'key1'
      });

      // Failed delivery
      nock('https://example.com').post('/webhook').times(4).reply(500);
      await service.deliver({
        url: 'https://example.com/webhook',
        secret: 'secret',
        payload: { test: true },
        eventType: 'test',
        idempotencyKey: 'key2'
      });

      const stats = service.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe('50.00%');
      expect(stats.inDeadLetterQueue).toBe(1);
    });
  });

  describe('verifyWebhookSignature function', () => {
    it('should verify valid webhook request', () => {
      const service = new WebhookDeliveryService();
      const payload = { data: 'test' };
      const secret = 'test-secret';
      const timestamp = Date.now().toString();
      const signature = service.generateSignature(payload, secret);

      const req = {
        headers: {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp
        },
        body: payload
      };

      expect(verifyWebhookSignature(req, secret)).toBe(true);
    });

    it('should reject request with old timestamp', () => {
      const service = new WebhookDeliveryService();
      const payload = { data: 'test' };
      const secret = 'test-secret';
      const oldTimestamp = (Date.now() - 400000).toString(); // 6+ minutes ago
      const signature = service.generateSignature(payload, secret);

      const req = {
        headers: {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': oldTimestamp
        },
        body: payload
      };

      expect(verifyWebhookSignature(req, secret)).toBe(false);
    });

    it('should reject request without signature', () => {
      const req = {
        headers: {
          'x-webhook-timestamp': Date.now().toString()
        },
        body: { data: 'test' }
      };

      expect(verifyWebhookSignature(req, 'secret')).toBe(false);
    });
  });
});
