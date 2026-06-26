// @ts-check
/**
 * Role-based access control middleware (#608).
 *
 * Permission matrix
 * ─────────────────────────────────────────────────────────────────────────
 *  viewer  → read-only access to public campaign data
 *  editor  → + create / update / delete campaigns
 *  admin   → + manage org members, rotate API keys
 *  owner   → + delete org, billing controls
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   app.post('/campaigns', requireApiKey, requirePermission('campaigns:write'), handler)
 */

export const ROLES = /** @type {const} */ (['owner', 'admin', 'editor', 'viewer']);

/** Permissions granted to each role (cumulative — higher roles inherit lower). */
export const ROLE_PERMISSIONS = {
  viewer: ['campaigns:read'],
  editor: ['campaigns:read', 'campaigns:write'],
  admin: [
    'campaigns:read',
    'campaigns:write',
    'members:read',
    'members:manage',
    'apikeys:manage',
    'audit:read',
  ],
  owner: [
    'campaigns:read',
    'campaigns:write',
    'members:read',
    'members:manage',
    'apikeys:manage',
    'org:manage',
    'org:delete',
    'audit:read',
  ],
};

/**
 * Return an Express middleware that allows the request only when the
 * authenticated caller holds a role that grants `perm`. Default-deny:
 * callers with no org role (e.g. an API key not associated with any org)
 * receive 403.
 *
 * @param {string} perm  — permission string from ROLE_PERMISSIONS values
 */
export function requirePermission(perm) {
  return function rbacMiddleware(req, res, next) {
    const role = req.auth?.orgRole;
    if (!role) {
      return res.status(403).json({
        error: 'Forbidden — no org role assigned to this key.',
        code: 'NO_ORG_ROLE',
      });
    }

    const granted = ROLE_PERMISSIONS[role] ?? [];
    if (!granted.includes(perm)) {
      return res.status(403).json({
        error: `Forbidden — role "${role}" does not grant "${perm}".`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    return next();
  };
}

/**
 * Enforce granular key-level scopes (#611).
 *
 * Env-sourced keys (`req.auth.source === 'env'`) carry no scopes array and are
 * treated as fully-privileged (backward-compatible with pre-scope deployments).
 * Database-backed keys must have the requested scope in their `scopes` array.
 *
 * A missing or insufficient scope returns 403 with no detail about which scope
 * is required (prevents enumeration).
 *
 * @param {string} scope — one of VALID_API_KEY_SCOPES
 */
export function requireScope(scope) {
  return function scopeMiddleware(req, res, next) {
    const auth = req.auth;

    // No auth object at all → should have been caught by requireApiKey, but guard anyway.
    if (!auth) {
      return res.status(403).json({ error: 'Forbidden.', code: 'FORBIDDEN' });
    }

    // Env-sourced keys are fully trusted (no scope restriction).
    if (auth.source === 'env') {
      return next();
    }

    const scopes = auth.scopes;
    if (!Array.isArray(scopes) || !scopes.includes(scope)) {
      return res.status(403).json({ error: 'Forbidden.', code: 'INSUFFICIENT_SCOPE' });
    }

    return next();
  };
}
