/**
 * Analytics API Routes
 * 
 * Privacy-respecting analytics endpoints for funnel tracking
 */

import express from 'express';
import {
  trackEvent,
  trackEventBatch,
  getFunnelMetrics,
  getDropOffAnalysis,
  getSourceAttribution,
  getRetentionMetrics,
  exportEvents,
  generateSessionId,
} from '../services/analyticsService.js';
import logger from '../utils/logger.js';
import { requireAdmin } from '../middleware/rbac.js';

const router = express.Router();

/**
 * POST /api/v1/analytics/events
 * Track a single analytics event
 * 
 * Body:
 * {
 *   event_name: string,
 *   session_id: string,
 *   campaign_id?: string,
 *   source?: string,
 *   medium?: string,
 *   campaign?: string,
 *   properties?: object,
 *   timestamp: string (ISO 8601)
 * }
 */
router.post('/events', async (req, res) => {
  try {
    // Check DNT header
    if (req.headers['dnt'] === '1') {
      return res.status(204).send();
    }
    
    const event = {
      event_name: req.body.event_name,
      session_id: req.body.session_id,
      campaign_id: req.body.campaign_id,
      source: req.body.source,
      medium: req.body.medium,
      campaign: req.body.campaign,
      properties: req.body.properties || {},
      timestamp: req.body.timestamp || new Date().toISOString(),
    };
    
    const result = await trackEvent(event);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.status(201).json({ success: true });
  } catch (error) {
    logger.error('Failed to track event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/analytics/events/batch
 * Track multiple analytics events in one request
 * 
 * Body:
 * {
 *   events: Array<Event>
 * }
 */
router.post('/events/batch', async (req, res) => {
  try {
    // Check DNT header
    if (req.headers['dnt'] === '1') {
      return res.status(204).send();
    }
    
    const { events } = req.body;
    
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'events must be an array' });
    }
    
    const result = await trackEventBatch(events);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        tracked: result.tracked,
        failed: result.failed,
      });
    }
    
    res.status(201).json({ 
      success: true, 
      tracked: result.tracked,
    });
  } catch (error) {
    logger.error('Failed to track event batch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/analytics/session
 * Generate a new anonymized session ID
 */
router.get('/session', (req, res) => {
  const sessionId = generateSessionId();
  res.json({ session_id: sessionId });
});

/**
 * GET /api/v1/analytics/funnel
 * Get funnel conversion metrics
 * 
 * Query params:
 * - start_date: ISO 8601 date
 * - end_date: ISO 8601 date
 * - source: UTM source filter
 * - medium: UTM medium filter
 * - campaign: UTM campaign filter
 * - campaign_id: Campaign ID filter
 */
router.get('/funnel', requireAdmin, async (req, res) => {
  try {
    const options = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      source: req.query.source,
      medium: req.query.medium,
      campaign: req.query.campaign,
      campaignId: req.query.campaign_id,
    };
    
    const metrics = await getFunnelMetrics(options);
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get funnel metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/analytics/dropoff
 * Get drop-off analysis for each funnel stage
 * 
 * Query params: same as /funnel
 */
router.get('/dropoff', requireAdmin, async (req, res) => {
  try {
    const options = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      source: req.query.source,
      medium: req.query.medium,
      campaign: req.query.campaign,
      campaignId: req.query.campaign_id,
    };
    
    const analysis = await getDropOffAnalysis(options);
    res.json(analysis);
  } catch (error) {
    logger.error('Failed to get dropoff analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/analytics/attribution
 * Get source attribution metrics
 * 
 * Query params:
 * - start_date: ISO 8601 date
 * - end_date: ISO 8601 date
 * - campaign_id: Campaign ID filter
 */
router.get('/attribution', requireAdmin, async (req, res) => {
  try {
    const options = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      campaignId: req.query.campaign_id,
    };
    
    const attribution = await getSourceAttribution(options);
    res.json(attribution);
  } catch (error) {
    logger.error('Failed to get attribution metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/analytics/retention
 * Get retention metrics
 * 
 * Query params:
 * - cohort_date: Date for cohort analysis
 * - campaign_id: Campaign ID filter
 */
router.get('/retention', requireAdmin, async (req, res) => {
  try {
    const options = {
      cohortDate: req.query.cohort_date,
      campaignId: req.query.campaign_id,
    };
    
    const retention = await getRetentionMetrics(options);
    res.json(retention);
  } catch (error) {
    logger.error('Failed to get retention metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/analytics/export
 * Export events for analysis
 * 
 * Query params:
 * - start_date: ISO 8601 date
 * - end_date: ISO 8601 date
 * - event_names: Comma-separated event names
 * - format: 'ndjson' or 'json' (default: ndjson)
 */
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const options = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      eventNames: req.query.event_names ? req.query.event_names.split(',') : undefined,
      format: req.query.format || 'ndjson',
    };
    
    const data = await exportEvents(options);
    
    if (options.format === 'ndjson') {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics-export.ndjson"');
      res.send(data);
    } else {
      res.json(data);
    }
  } catch (error) {
    logger.error('Failed to export events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/analytics/health
 * Health check for analytics system
 */
router.get('/health', async (req, res) => {
  try {
    // Simple health check - verify we can query the database
    const metrics = await getFunnelMetrics({ startDate: new Date().toISOString() });
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Analytics health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
