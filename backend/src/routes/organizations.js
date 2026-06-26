import express from 'express';
import { InvitationService } from '../services/invitationService.js';

/**
 * Organization and team member management routes
 */
export function createOrganizationRoutes(dal) {
  const router = express.Router();
  const invitationService = new InvitationService(dal);

  // Organizations
  /**
   * Create a new organization
   * POST /api/v1/organizations
   */
  router.post('/', async (req, res, next) => {
    try {
      const { name, slug } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: ['name is required'],
        });
      }

      const organization = dal.organizations.createOrganization({ name, slug });

      // Create the creator as an owner
      const creatorEmail = req.auth?.email || req.body.creatorEmail;
      if (creatorEmail) {
        dal.organizations.addMember({
          organizationId: organization.id,
          userEmail: creatorEmail,
          role: 'owner',
        });
      }

      await dal.auditLogs.log({
        entity: 'organization',
        entityId: organization.id,
        action: 'create',
        actor: creatorEmail || 'system',
        diff: { name, slug },
      });

      res.status(201).json(organization);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Get organization by ID
   * GET /api/v1/organizations/:id
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const organization = dal.organizations.getOrganizationById(req.params.id);

      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND',
        });
      }

      res.json(organization);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Update organization
   * PUT /api/v1/organizations/:id
   */
  router.put('/:id', async (req, res, next) => {
    try {
      const { name, slug } = req.body;
      const organization = dal.organizations.updateOrganization(req.params.id, { name, slug });

      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND',
        });
      }

      await dal.auditLogs.log({
        entity: 'organization',
        entityId: organization.id,
        action: 'update',
        actor: req.auth?.email || 'system',
        diff: { name, slug },
      });

      res.json(organization);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Delete organization
   * DELETE /api/v1/organizations/:id
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const deleted = dal.organizations.deleteOrganization(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          error: 'Organization not found',
          code: 'NOT_FOUND',
        });
      }

      await dal.auditLogs.log({
        entity: 'organization',
        entityId: req.params.id,
        action: 'delete',
        actor: req.auth?.email || 'system',
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Members
  /**
   * List organization members
   * GET /api/v1/organizations/:id/members
   */
  router.get('/:id/members', async (req, res, next) => {
    try {
      const members = dal.organizations.listMembers(req.params.id);
      res.json({ data: members });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Update member role
   * PUT /api/v1/organizations/:id/members/:memberId
   */
  router.put('/:id/members/:memberId', async (req, res, next) => {
    try {
      const { role } = req.body;

      if (!role || !['owner', 'admin', 'member'].includes(role)) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: ['role must be one of: owner, admin, member'],
        });
      }

      const result = await invitationService.updateMemberRole(
        req.params.memberId,
        req.params.id,
        role,
        req.auth?.email || 'system',
      );

      res.json(result.member);
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('does not belong')) {
        return res.status(404).json({
          error: error.message,
          code: 'NOT_FOUND',
        });
      }
      if (error.message.includes('last owner')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_OPERATION',
        });
      }
      next(error);
    }
  });

  /**
   * Remove member from organization
   * DELETE /api/v1/organizations/:id/members/:memberId
   */
  router.delete('/:id/members/:memberId', async (req, res, next) => {
    try {
      const result = await invitationService.removeMember(
        req.params.memberId,
        req.params.id,
        req.auth?.email || 'system',
      );

      if (!result.success) {
        return res.status(404).json({
          error: 'Member not found',
          code: 'NOT_FOUND',
        });
      }

      res.status(204).send();
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('does not belong')) {
        return res.status(404).json({
          error: error.message,
          code: 'NOT_FOUND',
        });
      }
      if (error.message.includes('last owner')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_OPERATION',
        });
      }
      next(error);
    }
  });

  // Invitations
  /**
   * Create invitation
   * POST /api/v1/organizations/:id/invitations
   */
  router.post('/:id/invitations', async (req, res, next) => {
    try {
      const { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [
            ...(!email ? ['email is required'] : []),
            ...(!role ? ['role is required'] : []),
          ],
        });
      }

      if (!['owner', 'admin', 'member'].includes(role)) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: ['role must be one of: owner, admin, member'],
        });
      }

      const result = await invitationService.createInvitation({
        organizationId: req.params.id,
        email,
        role,
        invitedBy: req.auth?.email || 'system',
      });

      await dal.auditLogs.log({
        entity: 'organization_invitation',
        entityId: result.invitation?.id,
        action: 'create',
        actor: req.auth?.email || 'system',
        diff: { email, role, type: result.type },
      });

      res.status(201).json(result);
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: error.message,
          code: 'NOT_FOUND',
        });
      }
      next(error);
    }
  });

  /**
   * List invitations
   * GET /api/v1/organizations/:id/invitations
   */
  router.get('/:id/invitations', async (req, res, next) => {
    try {
      const { status } = req.query;
      const invitations = dal.organizations.listInvitations(req.params.id, { status });
      res.json({ data: invitations });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Revoke invitation
   * DELETE /api/v1/organizations/:id/invitations/:invitationId
   */
  router.delete('/:id/invitations/:invitationId', async (req, res, next) => {
    try {
      const result = await invitationService.revokeInvitation(
        req.params.invitationId,
        req.params.id,
        req.auth?.email || 'system',
      );

      res.json(result);
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('does not belong')) {
        return res.status(404).json({
          error: error.message,
          code: 'NOT_FOUND',
        });
      }
      if (error.message.includes('Only pending')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_OPERATION',
        });
      }
      next(error);
    }
  });

  // Public invitation endpoints
  /**
   * Get invitation details by token
   * GET /api/v1/invitations/:token
   */
  router.get('/invite/:token', async (req, res, next) => {
    try {
      const invitation = invitationService.getInvitationByToken(req.params.token);

      if (!invitation) {
        return res.status(404).json({
          error: 'Invitation not found',
          code: 'NOT_FOUND',
        });
      }

      // Don't expose the full invitation, just the necessary info
      const organization = dal.organizations.getOrganizationById(invitation.organizationId);

      res.json({
        email: invitation.email,
        role: invitation.role,
        organization: organization ? { id: organization.id, name: organization.name } : null,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Accept invitation
   * POST /api/v1/invitations/:token/accept
   */
  router.post('/invite/:token/accept', async (req, res, next) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: ['email is required'],
        });
      }

      const result = await invitationService.acceptInvitation(req.params.token, email);

      res.json(result);
    } catch (error) {
      if (
        error.message.includes('Invalid') ||
        error.message.includes('expired') ||
        error.message.includes('revoked') ||
        error.message.includes('accepted') ||
        error.message.includes('does not match')
      ) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_INVITATION',
        });
      }
      next(error);
    }
  });

  return router;
}
