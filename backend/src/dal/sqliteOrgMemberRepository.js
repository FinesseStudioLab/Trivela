// @ts-check
import { randomUUID } from 'node:crypto';

export const VALID_ROLES = ['owner', 'admin', 'editor', 'viewer'];

function rowToMember(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    apiKeyId: row.api_key_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteOrgMemberRepository({ db }) {
  // ── Org CRUD ──────────────────────────────────────────────────────────────

  const insertOrgStmt = db.prepare(`INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)`);
  const selectOrgStmt = db.prepare(`SELECT * FROM orgs WHERE id = ?`);
  const deleteOrgStmt = db.prepare(`DELETE FROM orgs WHERE id = ?`);

  function createOrg({ name }) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    insertOrgStmt.run(id, name, createdAt);
    return { id, name, createdAt };
  }

  function getOrg(id) {
    const row = selectOrgStmt.get(id);
    if (!row) return null;
    return { id: row.id, name: row.name, createdAt: row.created_at };
  }

  function deleteOrg(id) {
    const info = deleteOrgStmt.run(id);
    return info.changes > 0;
  }

  // ── Member CRUD ───────────────────────────────────────────────────────────

  const insertMemberStmt = db.prepare(
    `INSERT INTO org_members (id, org_id, api_key_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const selectMemberByIdStmt = db.prepare(`SELECT * FROM org_members WHERE id = ?`);
  const selectByApiKeyStmt = db.prepare(
    `SELECT * FROM org_members WHERE api_key_id = ? ORDER BY created_at ASC LIMIT 1`,
  );
  const selectByOrgStmt = db.prepare(
    `SELECT * FROM org_members WHERE org_id = ? ORDER BY created_at ASC`,
  );
  const updateRoleStmt = db.prepare(`UPDATE org_members SET role = ? WHERE id = ?`);
  const deleteMemberStmt = db.prepare(`DELETE FROM org_members WHERE id = ?`);
  const countOwnersStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM org_members WHERE org_id = ? AND role = 'owner'`,
  );

  function addMember({ orgId, apiKeyId, role }) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    insertMemberStmt.run(id, orgId, apiKeyId, role, createdAt);
    return rowToMember({ id, org_id: orgId, api_key_id: apiKeyId, role, created_at: createdAt });
  }

  function getMembership(id) {
    const row = selectMemberByIdStmt.get(id);
    return row ? rowToMember(row) : null;
  }

  /** Resolve role for an API key (used by auth middleware). */
  function getByApiKeyId(apiKeyId) {
    const row = selectByApiKeyStmt.get(apiKeyId);
    return row ? rowToMember(row) : null;
  }

  function listByOrg(orgId) {
    return selectByOrgStmt.all(orgId).map(rowToMember);
  }

  function updateRole(membershipId, role) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    const info = updateRoleStmt.run(role, membershipId);
    return info.changes > 0;
  }

  function removeMember(membershipId) {
    const info = deleteMemberStmt.run(membershipId);
    return info.changes > 0;
  }

  /** Guard: at least one owner must remain in the org. */
  function ownerCount(orgId) {
    return countOwnersStmt.get(orgId)?.n ?? 0;
  }

  return {
    createOrg,
    getOrg,
    deleteOrg,
    addMember,
    getMembership,
    getByApiKeyId,
    listByOrg,
    updateRole,
    removeMember,
    ownerCount,
  };
}
