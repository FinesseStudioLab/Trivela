// @ts-check
/**
 * Org and membership management routes (#608).
 *
 * Route summary:
 *   POST   /orgs                            – create org          (master key)
 *   GET    /orgs/:orgId                     – get org info        (members:read)
 *   DELETE /orgs/:orgId                     – delete org          (org:delete)
 *   POST   /orgs/:orgId/members             – add member          (members:manage)
 *   GET    /orgs/:orgId/members             – list members        (members:read)
 *   PUT    /orgs/:orgId/members/:id         – change role         (members:manage)
 *   DELETE /orgs/:orgId/members/:id         – remove member       (members:manage)
 */

import { Router } from 'express';
import { requirePermission } from '../middleware/rbac.js';
import { VALID_ROLES } from '../dal/sqliteOrgMemberRepository.js';

/**
 * @param {{
 *   orgMemberRepository: ReturnType<import('../dal/sqliteOrgMemberRepository.js').createSqliteOrgMemberRepository>,
 *   requireMasterKey: import('express').RequestHandler[],
 *   requireApiKey: import('express').RequestHandler[],
 * }} deps
 */
export function createOrgRoutes({ orgMemberRepository, requireMasterKey, requireApiKey }) {
  const router = Router();

  // ── Create org (master-key only — bootstrapping) ──────────────────────────

  router.post('/orgs', requireMasterKey, (req, res) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
    }
    const org = orgMemberRepository.createOrg({ name: name.trim() });
    return res.status(201).json(org);
  });

  // ── Get org info ──────────────────────────────────────────────────────────

  router.get('/orgs/:orgId', requireApiKey, requirePermission('members:read'), (req, res) => {
    const org = orgMemberRepository.getOrg(req.params.orgId);
    if (!org) return res.status(404).json({ error: 'Org not found', code: 'ORG_NOT_FOUND' });

    // Callers can only see their own org.
    if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
      return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
    }

    return res.json(org);
  });

  // ── Delete org ────────────────────────────────────────────────────────────

  router.delete('/orgs/:orgId', requireApiKey, requirePermission('org:delete'), (req, res) => {
    if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
      return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
    }

    const deleted = orgMemberRepository.deleteOrg(req.params.orgId);
    if (!deleted) return res.status(404).json({ error: 'Org not found', code: 'ORG_NOT_FOUND' });

    return res.status(204).end();
  });

  // ── Add member ────────────────────────────────────────────────────────────

  router.post(
    '/orgs/:orgId/members',
    requireApiKey,
    requirePermission('members:manage'),
    (req, res) => {
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const { apiKeyId, role } = req.body ?? {};

      if (typeof apiKeyId !== 'string' || !apiKeyId.trim()) {
        return res.status(400).json({ error: 'apiKeyId is required', code: 'VALIDATION_ERROR' });
      }
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({
          error: `role must be one of: ${VALID_ROLES.join(', ')}`,
          code: 'VALIDATION_ERROR',
        });
      }

      // Only owner can assign the owner role.
      if (role === 'owner' && req.auth?.orgRole !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Only an owner can assign the owner role', code: 'INSUFFICIENT_ROLE' });
      }

      try {
        const membership = orgMemberRepository.addMember({
          orgId: req.params.orgId,
          apiKeyId: apiKeyId.trim(),
          role,
        });
        return res.status(201).json(membership);
      } catch (err) {
        if (String(err?.message).includes('UNIQUE constraint')) {
          return res
            .status(409)
            .json({ error: 'Key is already a member of this org', code: 'ALREADY_MEMBER' });
        }
        if (String(err?.message).includes('FOREIGN KEY constraint')) {
          return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
        }
        throw err;
      }
    },
  );

  // ── List members ──────────────────────────────────────────────────────────

  router.get(
    '/orgs/:orgId/members',
    requireApiKey,
    requirePermission('members:read'),
    (req, res) => {
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const members = orgMemberRepository.listByOrg(req.params.orgId);
      return res.json({ data: members });
    },
  );

  // ── Update member role ────────────────────────────────────────────────────

  router.put(
    '/orgs/:orgId/members/:membershipId',
    requireApiKey,
    requirePermission('members:manage'),
    (req, res) => {
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const { role } = req.body ?? {};
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({
          error: `role must be one of: ${VALID_ROLES.join(', ')}`,
          code: 'VALIDATION_ERROR',
        });
      }

      // Only owner can promote to owner.
      if (role === 'owner' && req.auth?.orgRole !== 'owner') {
        return res
          .status(403)
          .json({ error: 'Only an owner can assign the owner role', code: 'INSUFFICIENT_ROLE' });
      }

      const membership = orgMemberRepository.getMembership(req.params.membershipId);
      if (!membership || membership.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Membership not found', code: 'NOT_FOUND' });
      }

      // Guard: demoting the last owner is disallowed.
      if (membership.role === 'owner' && role !== 'owner') {
        if (orgMemberRepository.ownerCount(req.params.orgId) <= 1) {
          return res
            .status(409)
            .json({ error: 'Cannot demote the last owner of an org', code: 'LAST_OWNER' });
        }
      }

      orgMemberRepository.updateRole(req.params.membershipId, role);
      return res.json({ ...membership, role });
    },
  );

  // ── Remove member ─────────────────────────────────────────────────────────

  router.delete(
    '/orgs/:orgId/members/:membershipId',
    requireApiKey,
    requirePermission('members:manage'),
    (req, res) => {
      if (req.auth?.orgId && req.auth.orgId !== req.params.orgId) {
        return res.status(403).json({ error: 'Forbidden', code: 'WRONG_ORG' });
      }

      const membership = orgMemberRepository.getMembership(req.params.membershipId);
      if (!membership || membership.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Membership not found', code: 'NOT_FOUND' });
      }

      // Guard: cannot remove the last owner.
      if (membership.role === 'owner' && orgMemberRepository.ownerCount(req.params.orgId) <= 1) {
        return res
          .status(409)
          .json({ error: 'Cannot remove the last owner of an org', code: 'LAST_OWNER' });
      }

      orgMemberRepository.removeMember(req.params.membershipId);
      return res.status(204).end();
    },
  );

  return router;
}
