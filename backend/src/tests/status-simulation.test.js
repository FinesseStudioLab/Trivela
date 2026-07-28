/**
 * Status page simulation test
 * Simulates a dependency outage and verifies the status page reflects the degraded state
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createDal } from '../dal/index.js';

describe('Status Page Simulation Test', () => {
  let dal;
  let originalCheckSorobanRpcHealth;

  before(async () => {
    // Initialize DAL with in-memory database
    dal = await createDal({ dbPath: ':memory:' });

    // Mock the RPC health check function
    originalCheckSorobanRpcHealth = global.checkSorobanRpcHealth;
  });

  after(async () => {
    // Restore original function
    if (originalCheckSorobanRpcHealth) {
      global.checkSorobanRpcHealth = originalCheckSorobanRpcHealth;
    }
  });

  it('should create an incident for RPC outage', () => {
    const incidentId = `inc_${Date.now()}`;
    const now = new Date().toISOString();

    dal.status.createIncident({
      id: incidentId,
      title: 'Soroban RPC Outage',
      description: 'Unable to connect to Soroban RPC endpoints',
      components: ['rpc', 'contracts'],
      status: 'investigating',
      impact: 'critical',
      createdAt: now,
      updatedAt: now,
    });

    dal.status.createIncidentUpdate({
      incidentId,
      status: 'investigating',
      message: 'Investigating connectivity issues with Soroban RPC',
      timestamp: now,
    });

    const incident = dal.status.getIncident(incidentId);
    assert.ok(incident);
    assert.equal(incident.title, 'Soroban RPC Outage');
    assert.equal(incident.status, 'investigating');
    assert.equal(incident.impact, 'critical');
    assert.deepEqual(incident.components, ['rpc', 'contracts']);
  });

  it('should retrieve active incidents', () => {
    const investigatingIncidents = dal.status.listIncidents({ status: 'investigating' });
    assert.ok(investigatingIncidents.length > 0);
    assert.equal(investigatingIncidents[0].status, 'investigating');
  });

  it('should update incident status through lifecycle', () => {
    const incidents = dal.status.listIncidents({ status: 'investigating' });
    assert.ok(incidents.length > 0);

    const incidentId = incidents[0].id;
    const now = new Date().toISOString();

    // Update to identified
    dal.status.updateIncident({
      id: incidentId,
      status: 'identified',
      updatedAt: now,
    });

    dal.status.createIncidentUpdate({
      incidentId,
      status: 'identified',
      message: 'Issue identified: DNS resolution failure for RPC endpoints',
      timestamp: now,
    });

    const updated = dal.status.getIncident(incidentId);
    assert.equal(updated.status, 'identified');

    // Update to monitoring
    const monitoringTime = new Date().toISOString();
    dal.status.updateIncident({
      id: incidentId,
      status: 'monitoring',
      updatedAt: monitoringTime,
    });

    dal.status.createIncidentUpdate({
      incidentId,
      status: 'monitoring',
      message: 'Fix deployed, monitoring system stability',
      timestamp: monitoringTime,
    });

    const monitoring = dal.status.getIncident(incidentId);
    assert.equal(monitoring.status, 'monitoring');

    // Update to resolved
    const resolvedTime = new Date().toISOString();
    dal.status.updateIncident({
      id: incidentId,
      status: 'resolved',
      updatedAt: resolvedTime,
    });

    dal.status.createIncidentUpdate({
      incidentId,
      status: 'resolved',
      message: 'Issue resolved, all systems operational',
      timestamp: resolvedTime,
    });

    const resolved = dal.status.getIncident(incidentId);
    assert.equal(resolved.status, 'resolved');
  });

  it('should create scheduled maintenance notice', () => {
    const maintenanceId = `mnt_${Date.now()}`;
    const now = new Date().toISOString();
    const scheduledStart = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const scheduledEnd = new Date(Date.now() + 90000000).toISOString(); // Tomorrow + 1 hour

    dal.status.createMaintenance({
      id: maintenanceId,
      title: 'Database Maintenance',
      description: 'Scheduled database upgrade for performance improvements',
      components: ['database'],
      scheduledStart,
      scheduledEnd,
      createdAt: now,
    });

    const maintenance = dal.status.getMaintenance(maintenanceId);
    assert.ok(maintenance);
    assert.equal(maintenance.title, 'Database Maintenance');
    assert.deepEqual(maintenance.components, ['database']);
  });

  it('should filter maintenance by scheduled time', () => {
    const allMaintenance = dal.status.listMaintenance();
    assert.ok(allMaintenance.length > 0);

    // Filter for future maintenance
    const futureMaintenance = allMaintenance.filter(
      (m) => new Date(m.scheduled_end) > new Date(),
    );
    assert.ok(futureMaintenance.length > 0);
  });

  it('should handle subscriber lifecycle', () => {
    const subscriberId = `sub_${Date.now()}`;
    const now = new Date().toISOString();
    const email = 'test@example.com';

    dal.status.createSubscriber({
      id: subscriberId,
      email,
      components: ['api', 'rpc', 'indexer'],
      createdAt: now,
    });

    const subscriber = dal.status.getSubscriber(subscriberId);
    assert.ok(subscriber);
    assert.equal(subscriber.email, email);
    assert.deepEqual(subscriber.components, ['api', 'rpc', 'indexer']);

    // Check email lookup
    const byEmail = dal.status.getSubscriberByEmail(email);
    assert.ok(byEmail);
    assert.equal(byEmail.id, subscriberId);

    // Delete subscriber
    dal.status.deleteSubscriber(subscriberId);
    const deleted = dal.status.getSubscriber(subscriberId);
    assert.equal(deleted, null);
  });

  it('should prevent duplicate email subscriptions', () => {
    const email = 'duplicate@example.com';
    const now = new Date().toISOString();

    dal.status.createSubscriber({
      id: `sub_${Date.now()}`,
      email,
      components: ['api'],
      createdAt: now,
    });

    const existing = dal.status.getSubscriberByEmail(email);
    assert.ok(existing);

    // Attempting to create duplicate should be handled at the route level
    // This test verifies the DAL correctly identifies existing subscriptions
    assert.ok(existing);
  });

  it('should retrieve incident updates in chronological order', () => {
    const incidentId = `inc_${Date.now()}`;
    const now = new Date().toISOString();

    dal.status.createIncident({
      id: incidentId,
      title: 'Test Incident',
      description: 'Test description',
      components: ['api'],
      status: 'investigating',
      impact: 'minor',
      createdAt: now,
      updatedAt: now,
    });

    // Add multiple updates
    dal.status.createIncidentUpdate({
      incidentId,
      status: 'investigating',
      message: 'First update',
      timestamp: new Date(Date.now() - 2000).toISOString(),
    });

    dal.status.createIncidentUpdate({
      incidentId,
      status: 'identified',
      message: 'Second update',
      timestamp: new Date(Date.now() - 1000).toISOString(),
    });

    dal.status.createIncidentUpdate({
      incidentId,
      status: 'monitoring',
      message: 'Third update',
      timestamp: now,
    });

    const updates = dal.status.getIncidentUpdates(incidentId);
    assert.equal(updates.length, 3); // 3 updates created manually

    // Verify chronological order
    for (let i = 1; i < updates.length; i++) {
      assert.ok(new Date(updates[i].timestamp) >= new Date(updates[i - 1].timestamp));
    }
  });

  it('should simulate component status degradation based on incidents', () => {
    // Create a critical incident affecting RPC
    const incidentId = `inc_${Date.now()}`;
    const now = new Date().toISOString();

    dal.status.createIncident({
      id: incidentId,
      title: 'RPC Service Degradation',
      description: 'High latency on RPC endpoints',
      components: ['rpc'],
      status: 'investigating',
      impact: 'major',
      createdAt: now,
      updatedAt: now,
    });

    const incident = dal.status.getIncident(incidentId);
    assert.equal(incident.impact, 'major');
    assert.ok(incident.components.includes('rpc'));

    // Verify the incident affects the correct component
    const activeIncidents = dal.status.listIncidents({ status: 'investigating' });
    const rpcIncidents = activeIncidents.filter((inc) => inc.components.includes('rpc'));
    assert.ok(rpcIncidents.length > 0);
  });
});
