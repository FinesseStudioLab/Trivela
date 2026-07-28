/**
 * Status page routes for public incident communication
 * Provides health checks, incident lifecycle management, and maintenance notices
 */

import { Router } from 'express';
import { z } from 'zod';
import { log } from '../middleware/logger.js';
import { checkSorobanRpcHealth } from '../sorobanRpc.js';

const router = Router();

// Will be injected by the main server
let statusRepository = null;
let eventIndexer = null;
let rpcPool = null;

export function setStatusRepository(repo) {
  statusRepository = repo;
}

export function setEventIndexer(indexer) {
  eventIndexer = indexer;
}

export function setRpcPool(pool) {
  rpcPool = pool;
}

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
    if (!statusRepository) {
      return res.status(503).json({ error: 'Status repository not initialized' });
    }

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
        } else if (component.id === 'indexer') {
          // Check indexer health
          if (eventIndexer) {
            const health = eventIndexer.getHealth?.() ?? { status: 'unavailable' };
            status = health.status === 'ok' || health.status === 'idle' ? 'operational' : 'degraded';
          } else {
            status = 'operational';
          }
        } else if (component.id === 'contracts') {
          // Check RPC pool health for contracts
          if (rpcPool) {
            const poolStatus = rpcPool.getStatus();
            status = poolStatus.healthy > 0 ? 'operational' : 'outage';
          } else {
            status = 'operational';
          }
        } else if (component.id === 'database') {
          // Database is operational if we can query
          status = 'operational';
        }

        // Check if component is affected by active incidents
        const activeIncidents = statusRepository.listIncidents({ status: 'investigating' })
          .concat(statusRepository.listIncidents({ status: 'identified' }))
          .concat(statusRepository.listIncidents({ status: 'monitoring' }))
          .filter((inc) => inc.components.includes(component.id));

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
      }),
    );

    // Get active incidents
    const investigatingIncidents = statusRepository.listIncidents({ status: 'investigating' });
    const identifiedIncidents = statusRepository.listIncidents({ status: 'identified' });
    const monitoringIncidents = statusRepository.listIncidents({ status: 'monitoring' });
    const activeIncidents = [...investigatingIncidents, ...identifiedIncidents, ...monitoringIncidents]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((inc) => ({
        id: inc.id,
        title: inc.title,
        description: inc.description,
        components: inc.components,
        status: inc.status,
        impact: inc.impact,
        createdAt: inc.created_at,
        updatedAt: inc.updated_at,
        updates: statusRepository.getIncidentUpdates(inc.id),
      }));

    // Get scheduled maintenance
    const allMaintenance = statusRepository.listMaintenance();
    const scheduledMaintenance = allMaintenance
      .filter((maint) => new Date(maint.scheduled_end) > new Date())
      .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
      .map((maint) => ({
        id: maint.id,
        title: maint.title,
        description: maint.description,
        components: maint.components,
        scheduledStart: maint.scheduled_start,
        scheduledEnd: maint.scheduled_end,
        createdAt: maint.created_at,
      }));

    // Calculate overall status
    const hasOutage = componentStatus.some((c) => c.status === 'outage');
    const hasDegraded = componentStatus.some((c) => c.status === 'degraded');
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
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  const { status } = req.query;
  const incidents = statusRepository.listIncidents({ status })
    .map((inc) => ({
      id: inc.id,
      title: inc.title,
      description: inc.description,
      components: inc.components,
      status: inc.status,
      impact: inc.impact,
      createdAt: inc.created_at,
      updatedAt: inc.updated_at,
      updates: statusRepository.getIncidentUpdates(inc.id),
    }));

  res.json(incidents);
});

/**
 * POST /api/v1/status/incidents
 * Create a new incident (admin only)
 */
router.post('/incidents', async (req, res) => {
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  try {
    const data = incidentSchema.parse(req.body);
    const incidentId = `inc_${Date.now()}`;
    const now = new Date().toISOString();

    statusRepository.createIncident({
      id: incidentId,
      title: data.title,
      description: data.description,
      components: data.components,
      status: data.status,
      impact: data.impact,
      createdAt: now,
      updatedAt: now,
    });

    statusRepository.createIncidentUpdate({
      incidentId,
      status: data.status,
      message: data.description,
      timestamp: now,
    });

    log.info('Incident created', { incidentId, title: data.title, impact: data.impact });

    const incident = statusRepository.getIncident(incidentId);
    res.status(201).json({
      id: incident.id,
      title: incident.title,
      description: incident.description,
      components: incident.components,
      status: incident.status,
      impact: incident.impact,
      createdAt: incident.created_at,
      updatedAt: incident.updated_at,
      updates: statusRepository.getIncidentUpdates(incidentId),
    });
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
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  const incident = statusRepository.getIncident(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  try {
    const updateSchema = incidentSchema.partial().extend({
      message: z.string().optional(),
    });
    const data = updateSchema.parse(req.body);

    const now = new Date().toISOString();
    statusRepository.updateIncident({
      id: req.params.id,
      title: data.title,
      description: data.description,
      components: data.components,
      status: data.status,
      impact: data.impact,
      updatedAt: now,
    });

    if (data.message || data.status) {
      statusRepository.createIncidentUpdate({
        incidentId: req.params.id,
        status: data.status || incident.status,
        message: data.message || 'Status updated',
        timestamp: now,
      });
    }

    log.info('Incident updated', { incidentId: req.params.id, status: data.status || incident.status });

    const updatedIncident = statusRepository.getIncident(req.params.id);
    res.json({
      id: updatedIncident.id,
      title: updatedIncident.title,
      description: updatedIncident.description,
      components: updatedIncident.components,
      status: updatedIncident.status,
      impact: updatedIncident.impact,
      createdAt: updatedIncident.created_at,
      updatedAt: updatedIncident.updated_at,
      updates: statusRepository.getIncidentUpdates(req.params.id),
    });
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
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  const incident = statusRepository.getIncident(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  statusRepository.deleteIncident(req.params.id);
  log.info('Incident deleted', { incidentId: req.params.id });

  res.status(204).send();
});

/**
 * GET /api/v1/status/maintenance
 * Get all maintenance notices
 */
router.get('/maintenance', (req, res) => {
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  const maintenanceList = statusRepository.listMaintenance()
    .map((maint) => ({
      id: maint.id,
      title: maint.title,
      description: maint.description,
      components: maint.components,
      scheduledStart: maint.scheduled_start,
      scheduledEnd: maint.scheduled_end,
      createdAt: maint.created_at,
    }));

  res.json(maintenanceList);
});

/**
 * POST /api/v1/status/maintenance
 * Create a maintenance notice
 */
router.post('/maintenance', async (req, res) => {
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  try {
    const data = maintenanceSchema.parse(req.body);
    const maintenanceId = `mnt_${Date.now()}`;
    const now = new Date().toISOString();

    statusRepository.createMaintenance({
      id: maintenanceId,
      title: data.title,
      description: data.description,
      components: data.components,
      scheduledStart: data.scheduledStart,
      scheduledEnd: data.scheduledEnd,
      createdAt: now,
    });

    log.info('Maintenance notice created', { maintenanceId, title: data.title });

    const maintenance = statusRepository.getMaintenance(maintenanceId);
    res.status(201).json({
      id: maintenance.id,
      title: maintenance.title,
      description: maintenance.description,
      components: maintenance.components,
      scheduledStart: maintenance.scheduled_start,
      scheduledEnd: maintenance.scheduled_end,
      createdAt: maintenance.created_at,
    });
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
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  const maintenance = statusRepository.getMaintenance(req.params.id);
  if (!maintenance) {
    return res.status(404).json({ error: 'Maintenance notice not found' });
  }

  statusRepository.deleteMaintenance(req.params.id);
  log.info('Maintenance notice deleted', { maintenanceId: req.params.id });

  res.status(204).send();
});

/**
 * POST /api/v1/status/subscribe
 * Subscribe to status updates
 */
router.post('/subscribe', async (req, res) => {
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  try {
    const data = subscriberSchema.parse(req.body);
    const subscriberId = `sub_${Date.now()}`;
    const now = new Date().toISOString();

    // Check if email already subscribed
    const existing = statusRepository.getSubscriberByEmail(data.email);
    if (existing) {
      return res.status(409).json({ error: 'Email already subscribed', id: existing.id });
    }

    statusRepository.createSubscriber({
      id: subscriberId,
      email: data.email,
      components: data.components || COMPONENTS.map((c) => c.id),
      createdAt: now,
    });

    log.info('Status subscription created', { subscriberId, email: data.email });

    const subscriber = statusRepository.getSubscriber(subscriberId);
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
  if (!statusRepository) {
    return res.status(503).json({ error: 'Status repository not initialized' });
  }

  const subscriber = statusRepository.getSubscriber(req.params.id);
  if (!subscriber) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  statusRepository.deleteSubscriber(req.params.id);
  log.info('Status subscription deleted', { subscriberId: req.params.id });

  res.status(204).send();
});

export default router;
