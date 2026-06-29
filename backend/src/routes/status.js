/**
 * Status page routes for public incident communication
 * Provides health checks, incident lifecycle management, and maintenance notices
 */

import { Router } from 'express';
import { z } from 'zod';
import { log } from '../middleware/logger.js';
import { checkSorobanRpcHealth } from '../sorobanRpc.js';

const router = Router();

// In-memory storage (in production, use database)
const incidents = new Map();
const maintenanceNotices = new Map();
const subscribers = new Map();

let incidentIdCounter = 1;
let maintenanceIdCounter = 1;
let subscriberIdCounter = 1;

const COMPONENTS = [
  { id: 'api', name: 'API', description: 'REST API endpoints' },
  { id: 'rpc', name: 'Soroban RPC', description: 'Stellar Soroban RPC endpoint' },
  { id: 'indexer', name: 'Indexer', description: 'Campaign data indexer' },
  { id: 'contracts', name: 'Smart Contracts', description: 'Rewards & Campaign contracts' },
  { id: 'database', name: 'Database', description: 'Primary database' },
];

const incidentSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  components: z.array(z.string()),
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
  impact: z.enum(['none', 'minor', 'major', 'critical']),
});

const maintenanceSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  components: z.array(z.string()),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
});

const subscriberSchema = z.object({
  email: z.string().email(),
  components: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/status
 * Public status page with component health and active incidents
 */
router.get('/', async (req, res) => {
  try {
    // Check health of each component
    const componentStatus = await Promise.all(
      COMPONENTS.map(async (component) => {
        let status = 'operational';
        let latency = null;

        if (component.id === 'rpc') {
          try {
            const start = Date.now();
            const isHealthy = await checkSorobanRpcHealth();
            latency = Date.now() - start;
            status = isHealthy ? 'operational' : 'degraded';
          } catch {
            status = 'outage';
          }
        } else if (component.id === 'api') {
          // API is operational if this endpoint responds
          status = 'operational';
        } else {
          // Default to operational for other components
          status = 'operational';
        }

        // Check if component is affected by active incidents
        const activeIncidents = Array.from(incidents.values())
          .filter(inc => inc.status !== 'resolved' && inc.components.includes(component.id));

        if (activeIncidents.length > 0) {
          const maxImpact = activeIncidents.reduce((max, inc) => {
            const impactOrder = { none: 0, minor: 1, major: 2, critical: 3 };
            return impactOrder[inc.impact] > impactOrder[max] ? inc.impact : max;
          }, 'none');
          
          if (maxImpact === 'critical') status = 'outage';
          else if (maxImpact === 'major') status = 'degraded';
        }

        return {
          ...component,
          status,
          latency,
        };
      })
    );

    // Get active incidents
    const activeIncidents = Array.from(incidents.values())
      .filter(inc => inc.status !== 'resolved')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get scheduled maintenance
    const scheduledMaintenance = Array.from(maintenanceNotices.values())
      .filter(maint => new Date(maint.scheduledEnd) > new Date())
      .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

    // Calculate overall status
    const hasOutage = componentStatus.some(c => c.status === 'outage');
    const hasDegraded = componentStatus.some(c => c.status === 'degraded');
    const overallStatus = hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational';

    res.json({
      status: overallStatus,
      components: componentStatus,
      incidents: activeIncidents,
      maintenance: scheduledMaintenance,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    log.error('Status page error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * GET /api/v1/status/incidents
 * Get all incidents (including resolved)
 */
router.get('/incidents', (req, res) => {
  const { status } = req.query;
  let incidentList = Array.from(incidents.values());

  if (status) {
    incidentList = incidentList.filter(inc => inc.status === status);
  }

  res.json(incidentList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

/**
 * POST /api/v1/status/incidents
 * Create a new incident (admin only)
 */
router.post('/incidents', async (req, res) => {
  try {
    const data = incidentSchema.parse(req.body);
    const incidentId = `inc_${incidentIdCounter++}`;

    const incident = {
      id: incidentId,
      title: data.title,
      description: data.description,
      components: data.components,
      status: data.status,
      impact: data.impact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updates: [
        {
          status: data.status,
          message: data.description,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    incidents.set(incidentId, incident);

    log.info('Incident created', { incidentId, title: data.title, impact: data.impact });

    res.status(201).json(incident);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    log.error('Incident creation error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/v1/status/incidents/:id
 * Update an incident
 */
router.put('/incidents/:id', async (req, res) => {
  const incident = incidents.get(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  try {
    const updateSchema = incidentSchema.partial().extend({
      message: z.string().optional(),
    });
    const data = updateSchema.parse(req.body);

    if (data.title) incident.title = data.title;
    if (data.description) incident.description = data.description;
    if (data.components) incident.components = data.components;
    if (data.status) incident.status = data.status;
    if (data.impact) incident.impact = data.impact;

    incident.updatedAt = new Date().toISOString();

    if (data.message || data.status) {
      incident.updates.push({
        status: data.status || incident.status,
        message: data.message || 'Status updated',
        timestamp: new Date().toISOString(),
      });
    }

    incidents.set(req.params.id, incident);

    log.info('Incident updated', { incidentId: req.params.id, status: incident.status });

    res.json(incident);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    log.error('Incident update error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/status/incidents/:id
 * Delete an incident
 */
router.delete('/incidents/:id', (req, res) => {
  const incident = incidents.get(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  incidents.delete(req.params.id);
  log.info('Incident deleted', { incidentId: req.params.id });

  res.status(204).send();
});

/**
 * GET /api/v1/status/maintenance
 * Get all maintenance notices
 */
router.get('/maintenance', (req, res) => {
  const maintenanceList = Array.from(maintenanceNotices.values())
    .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

  res.json(maintenanceList);
});

/**
 * POST /api/v1/status/maintenance
 * Create a maintenance notice
 */
router.post('/maintenance', async (req, res) => {
  try {
    const data = maintenanceSchema.parse(req.body);
    const maintenanceId = `mnt_${maintenanceIdCounter++}`;

    const maintenance = {
      id: maintenanceId,
      title: data.title,
      description: data.description,
      components: data.components,
      scheduledStart: data.scheduledStart,
      scheduledEnd: data.scheduledEnd,
      createdAt: new Date().toISOString(),
    };

    maintenanceNotices.set(maintenanceId, maintenance);

    log.info('Maintenance notice created', { maintenanceId, title: data.title });

    res.status(201).json(maintenance);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    log.error('Maintenance creation error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/status/maintenance/:id
 * Delete a maintenance notice
 */
router.delete('/maintenance/:id', (req, res) => {
  const maintenance = maintenanceNotices.get(req.params.id);
  if (!maintenance) {
    return res.status(404).json({ error: 'Maintenance notice not found' });
  }

  maintenanceNotices.delete(req.params.id);
  log.info('Maintenance notice deleted', { maintenanceId: req.params.id });

  res.status(204).send();
});

/**
 * POST /api/v1/status/subscribe
 * Subscribe to status updates
 */
router.post('/subscribe', async (req, res) => {
  try {
    const data = subscriberSchema.parse(req.body);
    const subscriberId = `sub_${subscriberIdCounter++}`;

    const subscriber = {
      id: subscriberId,
      email: data.email,
      components: data.components || COMPONENTS.map(c => c.id),
      createdAt: new Date().toISOString(),
    };

    subscribers.set(subscriberId, subscriber);

    log.info('Status subscription created', { subscriberId, email: data.email });

    res.status(201).json({
      id: subscriber.id,
      email: subscriber.email,
      components: subscriber.components,
      message: 'Subscribed to status updates',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    log.error('Subscription error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/status/subscribe/:id
 * Unsubscribe from status updates
 */
router.delete('/subscribe/:id', (req, res) => {
  const subscriber = subscribers.get(req.params.id);
  if (!subscriber) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  subscribers.delete(req.params.id);
  log.info('Status subscription deleted', { subscriberId: req.params.id });

  res.status(204).send();
});

export default router;
