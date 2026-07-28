export function createSqliteStatusRepository({ db }) {
  return {
    // Incidents
    createIncident({ id, title, description, components, status, impact, createdAt, updatedAt }) {
      const stmt = db.prepare(`
        INSERT INTO status_incidents (id, title, description, components, status, impact, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, title, description, JSON.stringify(components), status, impact, createdAt, updatedAt);
      return { id };
    },

    getIncident(id) {
      const stmt = db.prepare(`
        SELECT id, title, description, components, status, impact, created_at, updated_at
        FROM status_incidents
        WHERE id = ?
      `);
      const incident = stmt.get(id);
      if (!incident) return null;
      return {
        ...incident,
        components: JSON.parse(incident.components),
      };
    },

    listIncidents({ status, limit = 100, offset = 0 } = {}) {
      let query = `
        SELECT id, title, description, components, status, impact, created_at, updated_at
        FROM status_incidents
      `;
      const params = [];

      if (status) {
        query += ` WHERE status = ?`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = db.prepare(query);
      const incidents = stmt.all(...params);
      return incidents.map((incident) => ({
        ...incident,
        components: JSON.parse(incident.components),
      }));
    },

    updateIncident({ id, title, description, components, status, impact, updatedAt }) {
      const updates = [];
      const params = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }
      if (components !== undefined) {
        updates.push('components = ?');
        params.push(JSON.stringify(components));
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (impact !== undefined) {
        updates.push('impact = ?');
        params.push(impact);
      }

      updates.push('updated_at = ?');
      params.push(updatedAt);
      params.push(id);

      const stmt = db.prepare(`
        UPDATE status_incidents
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      stmt.run(...params);
    },

    deleteIncident(id) {
      const stmt = db.prepare(`DELETE FROM status_incidents WHERE id = ?`);
      stmt.run(id);
    },

    // Incident Updates
    createIncidentUpdate({ incidentId, status, message, timestamp }) {
      const stmt = db.prepare(`
        INSERT INTO status_incident_updates (incident_id, status, message, timestamp)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(incidentId, status, message, timestamp);
      return { id: result.lastInsertRowid };
    },

    getIncidentUpdates(incidentId) {
      const stmt = db.prepare(`
        SELECT id, incident_id, status, message, timestamp
        FROM status_incident_updates
        WHERE incident_id = ?
        ORDER BY timestamp ASC
      `);
      return stmt.all(incidentId);
    },

    // Maintenance
    createMaintenance({ id, title, description, components, scheduledStart, scheduledEnd, createdAt }) {
      const stmt = db.prepare(`
        INSERT INTO status_maintenance (id, title, description, components, scheduled_start, scheduled_end, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, title, description, JSON.stringify(components), scheduledStart, scheduledEnd, createdAt);
      return { id };
    },

    getMaintenance(id) {
      const stmt = db.prepare(`
        SELECT id, title, description, components, scheduled_start, scheduled_end, created_at
        FROM status_maintenance
        WHERE id = ?
      `);
      const maintenance = stmt.get(id);
      if (!maintenance) return null;
      return {
        ...maintenance,
        components: JSON.parse(maintenance.components),
      };
    },

    listMaintenance({ limit = 100, offset = 0 } = {}) {
      const stmt = db.prepare(`
        SELECT id, title, description, components, scheduled_start, scheduled_end, created_at
        FROM status_maintenance
        ORDER BY scheduled_start ASC
        LIMIT ? OFFSET ?
      `);
      const maintenanceList = stmt.all(limit, offset);
      return maintenanceList.map((maintenance) => ({
        ...maintenance,
        components: JSON.parse(maintenance.components),
      }));
    },

    deleteMaintenance(id) {
      const stmt = db.prepare(`DELETE FROM status_maintenance WHERE id = ?`);
      stmt.run(id);
    },

    // Subscribers
    createSubscriber({ id, email, components, createdAt }) {
      const stmt = db.prepare(`
        INSERT INTO status_subscribers (id, email, components, created_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(id, email, JSON.stringify(components), createdAt);
      return { id };
    },

    getSubscriber(id) {
      const stmt = db.prepare(`
        SELECT id, email, components, created_at
        FROM status_subscribers
        WHERE id = ?
      `);
      const subscriber = stmt.get(id);
      if (!subscriber) return null;
      return {
        ...subscriber,
        components: JSON.parse(subscriber.components),
      };
    },

    getSubscriberByEmail(email) {
      const stmt = db.prepare(`
        SELECT id, email, components, created_at
        FROM status_subscribers
        WHERE email = ?
      `);
      const subscriber = stmt.get(email);
      if (!subscriber) return null;
      return {
        ...subscriber,
        components: JSON.parse(subscriber.components),
      };
    },

    listSubscribers({ limit = 100, offset = 0 } = {}) {
      const stmt = db.prepare(`
        SELECT id, email, components, created_at
        FROM status_subscribers
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      const subscribers = stmt.all(limit, offset);
      return subscribers.map((subscriber) => ({
        ...subscriber,
        components: JSON.parse(subscriber.components),
      }));
    },

    deleteSubscriber(id) {
      const stmt = db.prepare(`DELETE FROM status_subscribers WHERE id = ?`);
      stmt.run(id);
    },
  };
}
