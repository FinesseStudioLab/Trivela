/**
 * Webhook management routes for partners
 * Provides endpoint registration, event subscriptions, delivery logs, and replay functionality
 */

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { log } from '../middleware/logger.js';

const router = Router();

// In-memory storage (in production, use database)
const webhooks = new Map();
const deliveryLogs = new Map();
let webhookIdCounter = 1;
let deliveryIdCounter = 1;

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum(['campaign.created', 'campaign.updated', 'participant.registered', 'reward.claimed']),
  ),
  secret: z.string().min(16).optional(),
  description: z.string().optional(),
});

const deliveryLogSchema = z.object({
  webhookId: z.string(),
  eventId: z.string(),
  eventType: z.string(),
  status: z.enum(['pending', 'success', 'failed']),
  statusCode: z.number().optional(),
  response: z.string().optional(),
  timestamp: z.string(),
});

/**
 * POST /api/v1/webhooks
 * Register a new webhook endpoint
 */
router.post('/', async (req, res) => {
  try {
    const data = webhookSchema.parse(req.body);
    const webhookId = `whk_${webhookIdCounter++}`;
    const secret = data.secret || crypto.randomBytes(32).toString('hex');

    const webhook = {
      id: webhookId,
      url: data.url,
      events: data.events,
      secret,
      description: data.description || '',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    webhooks.set(webhookId, webhook);

    log.info('Webhook registered', { webhookId, url: data.url, events: data.events });

    res.status(201).json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret: webhook.secret, // Only shown once on creation
      description: webhook.description,
      active: webhook.active,
      createdAt: webhook.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    log.error('Webhook creation error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/webhooks
 * List all webhooks
 */
router.get('/', (req, res) => {
  const webhookList = Array.from(webhooks.values()).map(({ secret, ...rest }) => rest);
  res.json(webhookList);
});

/**
 * GET /api/v1/webhooks/:id
 * Get a specific webhook
 */
router.get('/:id', (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  const { secret, ...rest } = webhook;
  res.json(rest);
});

/**
 * PUT /api/v1/webhooks/:id
 * Update a webhook
 */
router.put('/:id', async (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  try {
    const updateSchema = webhookSchema.partial().extend({
      rotateSecret: z.boolean().optional(),
    });
    const data = updateSchema.parse(req.body);

    if (data.url) webhook.url = data.url;
    if (data.events) webhook.events = data.events;
    if (data.description !== undefined) webhook.description = data.description;
    if (data.rotateSecret) {
      webhook.secret = crypto.randomBytes(32).toString('hex');
    }
    webhook.updatedAt = new Date().toISOString();

    webhooks.set(req.params.id, webhook);

    const { secret, ...rest } = webhook;
    if (data.rotateSecret) {
      rest.secret = secret; // Only return secret if rotated
    }

    log.info('Webhook updated', { webhookId: req.params.id });

    res.json(rest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    log.error('Webhook update error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook
 */
router.delete('/:id', (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  webhooks.delete(req.params.id);
  log.info('Webhook deleted', { webhookId: req.params.id });

  res.status(204).send();
});

/**
 * GET /api/v1/webhooks/:id/deliveries
 * Get delivery logs for a webhook
 */
router.get('/:id/deliveries', (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const logs = Array.from(deliveryLogs.values())
    .filter((log) => log.webhookId === req.params.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json(logs);
});

/**
 * POST /api/v1/webhooks/:id/deliveries/:deliveryId/replay
 * Replay a failed delivery
 */
router.post('/:id/deliveries/:deliveryId/replay', async (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const delivery = deliveryLogs.get(req.params.deliveryId);
  if (!delivery || delivery.webhookId !== req.params.id) {
    return res.status(404).json({ error: 'Delivery not found' });
  }

  // Simulate replay
  const newDeliveryId = `del_${deliveryIdCounter++}`;
  const replayDelivery = {
    ...delivery,
    id: newDeliveryId,
    status: 'pending',
    timestamp: new Date().toISOString(),
    isReplay: true,
    originalDeliveryId: req.params.deliveryId,
  };

  deliveryLogs.set(newDeliveryId, replayDelivery);

  // Simulate async delivery
  setTimeout(async () => {
    try {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(JSON.stringify({ event: delivery.eventType, data: delivery.eventId }))
        .digest('hex');

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': delivery.eventType,
          'X-Webhook-ID': newDeliveryId,
        },
        body: JSON.stringify({
          event: delivery.eventType,
          data: delivery.eventId,
          timestamp: new Date().toISOString(),
        }),
      });

      replayDelivery.status = response.ok ? 'success' : 'failed';
      replayDelivery.statusCode = response.status;
      replayDelivery.response = response.ok ? 'Delivered' : await response.text();
      deliveryLogs.set(newDeliveryId, replayDelivery);

      log.info('Webhook replay completed', {
        webhookId: req.params.id,
        deliveryId: newDeliveryId,
        status: replayDelivery.status,
      });
    } catch (error) {
      replayDelivery.status = 'failed';
      replayDelivery.response = error.message;
      deliveryLogs.set(newDeliveryId, replayDelivery);
      log.error('Webhook replay failed', { error: error.message });
    }
  }, 100);

  res.json({
    id: newDeliveryId,
    status: 'pending',
    message: 'Replay initiated',
  });
});

/**
 * POST /api/v1/webhooks/:id/test
 * Test a webhook with a sample event
 */
router.post('/:id/test', async (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const { eventType = 'campaign.created' } = req.body;

  const testPayload = {
    event: eventType,
    data: { test: true, timestamp: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  };

  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(JSON.stringify(testPayload))
    .digest('hex');

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventType,
        'X-Webhook-ID': 'test',
      },
      body: JSON.stringify(testPayload),
    });

    const result = {
      success: response.ok,
      statusCode: response.status,
      response: response.ok ? 'Test delivered successfully' : await response.text(),
      signature,
      payload: testPayload,
    };

    log.info('Webhook test completed', {
      webhookId: req.params.id,
      success: result.success,
    });

    res.json(result);
  } catch (error) {
    log.error('Webhook test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      signature,
      payload: testPayload,
    });
  }
});

export default router;
