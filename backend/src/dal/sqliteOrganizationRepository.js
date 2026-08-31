import crypto from 'crypto';

/**
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} OrganizationMember
 * @property {string} id
 * @property {string} organizationId
 * @property {string} userEmail
 * @property {string} role - 'owner' | 'admin' | 'member'
 * @property {string} joinedAt
 */

/**
 * @typedef {Object} OrganizationInvitation
 * @property {string} id
 * @property {string} organizationId
 * @property {string} email
 * @property {string} role
 * @property {string} token
 * @property {string} invitedBy
 * @property {string} invitedAt
 * @property {string} expiresAt
 * @property {string|null} acceptedAt
 * @property {string|null} revokedAt
 * @property {string} status - 'pending' | 'accepted' | 'revoked' | 'expired'
 */

export class SqliteOrganizationRepository {
  constructor(db) {
    this.db = db;
  }

  // Organizations
  /**
   * Create a new organization
   * @param {Object} data
   * @param {string} data.name
   * @param {string} [data.slug]
   * @returns {Organization}
   */
  createOrganization({ name, slug }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const orgSlug = slug || this._slugify(name);

    const stmt = this.db.prepare(`
      INSERT INTO organizations (id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, orgSlug, now, now);

    return this.getOrganizationById(id);
  }

  /**
   * Get organization by ID
   * @param {string} id
   * @returns {Organization|null}
   */
  getOrganizationById(id) {
    const stmt = this.db.prepare('SELECT * FROM organizations WHERE id = ?');
    const row = stmt.get(id);
    return row ? this._mapOrganizationRow(row) : null;
  }

  /**
   * Get organization by slug
   * @param {string} slug
   * @returns {Organization|null}
   */
  getOrganizationBySlug(slug) {
    const stmt = this.db.prepare('SELECT * FROM organizations WHERE slug = ?');
    const row = stmt.get(slug);
    return row ? this._mapOrganizationRow(row) : null;
  }

  /**
   * Update organization
   * @param {string} id
   * @param {Object} updates
   * @param {string} [updates.name]
   * @param {string} [updates.slug]
   * @returns {Organization|null}
   */
  updateOrganization(id, updates) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.slug !== undefined) {
      fields.push('slug = ?');
      values.push(updates.slug);
    }

    if (fields.length === 0) {
      return this.getOrganizationById(id);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE organizations
      SET ${fields.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...values);

    return this.getOrganizationById(id);
  }

  /**
   * Delete organization
   * @param {string} id
   * @returns {boolean}
   */
  deleteOrganization(id) {
    const stmt = this.db.prepare('DELETE FROM organizations WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  // Members
  /**
   * Add member to organization
   * @param {Object} data
   * @param {string} data.organizationId
   * @param {string} data.userEmail
   * @param {string} data.role
   * @returns {OrganizationMember}
   */
  addMember({ organizationId, userEmail, role }) {
    const id = crypto.randomUUID();
    const joinedAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO organization_members (id, organization_id, user_email, role, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, organizationId, userEmail, role, joinedAt);

    return this.getMemberById(id);
  }

  /**
   * Get member by ID
   * @param {string} id
   * @returns {OrganizationMember|null}
   */
  getMemberById(id) {
    const stmt = this.db.prepare('SELECT * FROM organization_members WHERE id = ?');
    const row = stmt.get(id);
    return row ? this._mapMemberRow(row) : null;
  }

  /**
   * Get member by organization and email
   * @param {string} organizationId
   * @param {string} userEmail
   * @returns {OrganizationMember|null}
   */
  getMemberByOrgAndEmail(organizationId, userEmail) {
    const stmt = this.db.prepare(`
      SELECT * FROM organization_members
      WHERE organization_id = ? AND user_email = ?
    `);
    const row = stmt.get(organizationId, userEmail);
    return row ? this._mapMemberRow(row) : null;
  }

  /**
   * List members of an organization
   * @param {string} organizationId
   * @returns {OrganizationMember[]}
   */
  listMembers(organizationId) {
    const stmt = this.db.prepare(`
      SELECT * FROM organization_members
      WHERE organization_id = ?
      ORDER BY joined_at ASC
    `);
    const rows = stmt.all(organizationId);
    return rows.map((row) => this._mapMemberRow(row));
  }

  /**
   * Count owners in organization
   * @param {string} organizationId
   * @returns {number}
   */
  countOwners(organizationId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM organization_members
      WHERE organization_id = ? AND role = 'owner'
    `);
    const row = stmt.get(organizationId);
    return row?.count || 0;
  }

  /**
   * Update member role
   * @param {string} id
   * @param {string} role
   * @returns {OrganizationMember|null}
   */
  updateMemberRole(id, role) {
    const stmt = this.db.prepare(`
      UPDATE organization_members
      SET role = ?
      WHERE id = ?
    `);
    stmt.run(role, id);
    return this.getMemberById(id);
  }

  /**
   * Remove member from organization
   * @param {string} id
   * @returns {boolean}
   */
  removeMember(id) {
    const stmt = this.db.prepare('DELETE FROM organization_members WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  // Invitations
  /**
   * Create invitation
   * @param {Object} data
   * @param {string} data.organizationId
   * @param {string} data.email
   * @param {string} data.role
   * @param {string} data.invitedBy
   * @param {number} [data.expiresInDays=7]
   * @returns {OrganizationInvitation}
   */
  createInvitation({ organizationId, email, role, invitedBy, expiresInDays = 7 }) {
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    const invitedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO organization_invitations
      (id, organization_id, email, role, token, invited_by, invited_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(id, organizationId, email, role, token, invitedBy, invitedAt, expiresAt);

    return this.getInvitationById(id);
  }

  /**
   * Get invitation by ID
   * @param {string} id
   * @returns {OrganizationInvitation|null}
   */
  getInvitationById(id) {
    const stmt = this.db.prepare('SELECT * FROM organization_invitations WHERE id = ?');
    const row = stmt.get(id);
    return row ? this._mapInvitationRow(row) : null;
  }

  /**
   * Get invitation by token
   * @param {string} token
   * @returns {OrganizationInvitation|null}
   */
  getInvitationByToken(token) {
    const stmt = this.db.prepare('SELECT * FROM organization_invitations WHERE token = ?');
    const row = stmt.get(token);
    return row ? this._mapInvitationRow(row) : null;
  }

  /**
   * List invitations for organization
   * @param {string} organizationId
   * @param {Object} [options]
   * @param {string} [options.status] - Filter by status
   * @returns {OrganizationInvitation[]}
   */
  listInvitations(organizationId, options = {}) {
    let query = 'SELECT * FROM organization_invitations WHERE organization_id = ?';
    const params = [organizationId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY invited_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);
    return rows.map((row) => this._mapInvitationRow(row));
  }

  /**
   * Accept invitation
   * @param {string} id
   * @returns {OrganizationInvitation|null}
   */
  acceptInvitation(id) {
    const acceptedAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE organization_invitations
      SET status = 'accepted', accepted_at = ?
      WHERE id = ?
    `);
    stmt.run(acceptedAt, id);
    return this.getInvitationById(id);
  }

  /**
   * Revoke invitation
   * @param {string} id
   * @returns {OrganizationInvitation|null}
   */
  revokeInvitation(id) {
    const revokedAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE organization_invitations
      SET status = 'revoked', revoked_at = ?
      WHERE id = ?
    `);
    stmt.run(revokedAt, id);
    return this.getInvitationById(id);
  }

  /**
   * Mark invitation as expired
   * @param {string} id
   * @returns {OrganizationInvitation|null}
   */
  markInvitationExpired(id) {
    const stmt = this.db.prepare(`
      UPDATE organization_invitations
      SET status = 'expired'
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getInvitationById(id);
  }

  // Helper methods
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  _mapOrganizationRow(row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _mapMemberRow(row) {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userEmail: row.user_email,
      role: row.role,
      joinedAt: row.joined_at,
    };
  }

  _mapInvitationRow(row) {
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role,
      token: row.token,
      invitedBy: row.invited_by,
      invitedAt: row.invited_at,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      status: row.status,
    };
  }
}
