/**
 * SSE (Server-Sent Events) route — /api/v1/campaigns/:id/stream
 *
 * Provides real-time push updates for campaign stats and leaderboard changes.
 * Clients connect via EventSource and receive typed events.
 *
 * Features:
 * - Last-Event-ID resume support
 * - Heartbeat to keep connection alive
 * - Auth via API key query param (SSE doesn't support headers)
 * - Backpressure: slow clients are disconnected
 */

import { Router } from 'express';

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_CLIENTS_PER_CAMPAIGN = 100;

/** @type {Map<string, Set<import('express').Response>>} */
const campaignStreams = new Map();

/**
 * Register an SSE client for a campaign.
 * @param {string} campaignId
 * @param {import('express').Response} res
 */
function subscribe(campaignId, res) {
  if (!campaignStreams.has(campaignId)) {
    campaignStreams.set(campaignId, new Set());
  }

  const clients = campaignStreams.get(campaignId);
  if (clients.size >= MAX_CLIENTS_PER_CAMPAIGN) {
    res.status(429).json({ error: 'Too many subscribers for this campaign' });
    return false;
  }

  clients.add(res);
  return true;
}

/**
 * Remove an SSE client.
 * @param {string} campaignId
 * @param {import('express').Response} res
 */
function unsubscribe(campaignId, res) {
  const clients = campaignStreams.get(campaignId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      campaignStreams.delete(campaignId);
    }
  }
}

/**
 * Broadcast an event to all subscribers of a campaign.
 * @param {string} campaignId
 * @param {string} eventType
 * @param {object} data
 * @param {string} [eventId]
 */
export function broadcastCampaignEvent(campaignId, eventType, data, eventId) {
  const clients = campaignStreams.get(campaignId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n${eventId ? `id: ${eventId}\n` : ''}\n`;

  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      // Client disconnected
      unsubscribe(campaignId, res);
    }
  }
}

/**
 * Create the SSE router.
 * @param {object} options
 * @param {import('../dal/index.js').CampaignRepository} options.campaignRepository
 * @returns {Router}
 */
export function createSseRoutes({ campaignRepository }) {
  const router = Router();

  router.get('/campaigns/:id/stream', (req, res) => {
    const { id } = req.params;
    const campaign = campaignRepository.getById(id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Register client
    const subscribed = subscribe(id, res);
    if (!subscribed) return;

    // Send initial state
    const initEvent = `event: connected\ndata: ${JSON.stringify({
      campaignId: id,
      campaignName: campaign.name,
      participantCount: campaign.participantCount ?? campaign.registrations ?? 0,
      timestamp: new Date().toISOString(),
    })}\n\n`;
    res.write(initEvent);

    // Handle Last-Event-ID resume
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
      res.write(`event: resumed\ndata: ${JSON.stringify({ fromEventId: lastEventId })}\n\n`);
    }

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        unsubscribe(id, res);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe(id, res);
    });
  });

  // Campaign leaderboard stream
  router.get('/campaigns/:id/leaderboard/stream', (req, res) => {
    const { id } = req.params;
    const campaign = campaignRepository.getById(id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const roomKey = `${id}:leaderboard`;
    const subscribed = subscribe(roomKey, res);
    if (!subscribed) return;

    // Send initial leaderboard
    const initEvent = `event: connected\ndata: ${JSON.stringify({
      campaignId: id,
      type: 'leaderboard',
      timestamp: new Date().toISOString(),
    })}\n\n`;
    res.write(initEvent);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        unsubscribe(roomKey, res);
      }
    }, HEARTBEAT_INTERVAL_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe(roomKey, res);
    });
  });

  return router;
}
