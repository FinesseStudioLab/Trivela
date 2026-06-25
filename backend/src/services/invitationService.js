/**
 * Service for managing team member invitations
 */
export class InvitationService {
  constructor(dal) {
    this.dal = dal;
  }

  /**
   * Create and send an invitation
   * @param {Object} params
   * @param {string} params.organizationId
   * @param {string} params.email
   * @param {string} params.role
   * @param {string} params.invitedBy
   * @returns {Promise<Object>}
   */
  async createInvitation({ organizationId, email, role, invitedBy }) {
    // Validate organization exists
    const org = this.dal.organizations.getOrganizationById(organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }

    // Check if user is already a member
    const existingMember = this.dal.organizations.getMemberByOrgAndEmail(organizationId, email);
    if (existingMember) {
      // Update role if different
      if (existingMember.role !== role) {
        const updated = this.dal.organizations.updateMemberRole(existingMember.id, role);
        return {
          type: 'member_updated',
          member: updated,
        };
      }
      return {
        type: 'already_member',
        member: existingMember,
      };
    }

    // Check for pending invitation
    const pendingInvitations = this.dal.organizations.listInvitations(organizationId, {
      status: 'pending',
    });
    const existingInvite = pendingInvitations.find((inv) => inv.email === email);

    if (existingInvite) {
      // Check if expired
      if (new Date(existingInvite.expiresAt) < new Date()) {
        this.dal.organizations.markInvitationExpired(existingInvite.id);
      } else {
        // Update role if different
        if (existingInvite.role !== role) {
          // Revoke old and create new
          this.dal.organizations.revokeInvitation(existingInvite.id);
        } else {
          return {
            type: 'invitation_exists',
            invitation: existingInvite,
          };
        }
      }
    }

    // Create new invitation
    const invitation = this.dal.organizations.createInvitation({
      organizationId,
      email,
      role,
      invitedBy,
    });

    // TODO: Send email notification (will be integrated with issue #342)
    // For now, we just return the invitation with the token

    return {
      type: 'invitation_created',
      invitation,
      inviteLink: this._generateInviteLink(invitation.token),
    };
  }

  /**
   * Accept an invitation
   * @param {string} token
   * @param {string} userEmail
   * @returns {Promise<Object>}
   */
  async acceptInvitation(token, userEmail) {
    const invitation = this.dal.organizations.getInvitationByToken(token);

    if (!invitation) {
      throw new Error('Invalid invitation token');
    }

    // Check if already accepted
    if (invitation.status === 'accepted') {
      throw new Error('Invitation already accepted');
    }

    // Check if revoked
    if (invitation.status === 'revoked') {
      throw new Error('Invitation has been revoked');
    }

    // Check if expired
    if (new Date(invitation.expiresAt) < new Date() || invitation.status === 'expired') {
      this.dal.organizations.markInvitationExpired(invitation.id);
      throw new Error('Invitation has expired');
    }

    // Verify email matches (case-insensitive)
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error('Email does not match invitation');
    }

    // Check if already a member (in case added directly)
    const existingMember = this.dal.organizations.getMemberByOrgAndEmail(
      invitation.organizationId,
      userEmail,
    );
    if (existingMember) {
      // Mark invitation as accepted anyway
      this.dal.organizations.acceptInvitation(invitation.id);
      return {
        type: 'already_member',
        member: existingMember,
      };
    }

    // Add member to organization
    const member = this.dal.organizations.addMember({
      organizationId: invitation.organizationId,
      userEmail,
      role: invitation.role,
    });

    // Mark invitation as accepted
    this.dal.organizations.acceptInvitation(invitation.id);

    // Log to audit
    await this.dal.auditLogs.log({
      entity: 'organization_member',
      entityId: member.id,
      action: 'create',
      actor: userEmail,
      diff: {
        organizationId: invitation.organizationId,
        role: invitation.role,
        source: 'invitation',
      },
    });

    return {
      type: 'accepted',
      member,
      organization: this.dal.organizations.getOrganizationById(invitation.organizationId),
    };
  }

  /**
   * Revoke an invitation
   * @param {string} invitationId
   * @param {string} organizationId
   * @param {string} revokedBy
   * @returns {Promise<Object>}
   */
  async revokeInvitation(invitationId, organizationId, revokedBy) {
    const invitation = this.dal.organizations.getInvitationById(invitationId);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.organizationId !== organizationId) {
      throw new Error('Invitation does not belong to this organization');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Only pending invitations can be revoked');
    }

    const revoked = this.dal.organizations.revokeInvitation(invitationId);

    // Log to audit
    await this.dal.auditLogs.log({
      entity: 'organization_invitation',
      entityId: invitationId,
      action: 'delete',
      actor: revokedBy,
      diff: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    return {
      type: 'revoked',
      invitation: revoked,
    };
  }

  /**
   * Remove a member from organization
   * @param {string} memberId
   * @param {string} organizationId
   * @param {string} removedBy
   * @returns {Promise<Object>}
   */
  async removeMember(memberId, organizationId, removedBy) {
    const member = this.dal.organizations.getMemberById(memberId);

    if (!member) {
      throw new Error('Member not found');
    }

    if (member.organizationId !== organizationId) {
      throw new Error('Member does not belong to this organization');
    }

    // Check if trying to remove the last owner
    if (member.role === 'owner') {
      const ownerCount = this.dal.organizations.countOwners(organizationId);
      if (ownerCount <= 1) {
        throw new Error('Cannot remove the last owner of the organization');
      }
    }

    const removed = this.dal.organizations.removeMember(memberId);

    if (removed) {
      // Log to audit
      await this.dal.auditLogs.log({
        entity: 'organization_member',
        entityId: memberId,
        action: 'delete',
        actor: removedBy,
        diff: {
          userEmail: member.userEmail,
          role: member.role,
        },
      });
    }

    return {
      type: 'removed',
      success: removed,
    };
  }

  /**
   * Update member role
   * @param {string} memberId
   * @param {string} organizationId
   * @param {string} newRole
   * @param {string} updatedBy
   * @returns {Promise<Object>}
   */
  async updateMemberRole(memberId, organizationId, newRole, updatedBy) {
    const member = this.dal.organizations.getMemberById(memberId);

    if (!member) {
      throw new Error('Member not found');
    }

    if (member.organizationId !== organizationId) {
      throw new Error('Member does not belong to this organization');
    }

    const oldRole = member.role;

    // Check if demoting the last owner
    if (oldRole === 'owner' && newRole !== 'owner') {
      const ownerCount = this.dal.organizations.countOwners(organizationId);
      if (ownerCount <= 1) {
        throw new Error('Cannot change role of the last owner');
      }
    }

    const updated = this.dal.organizations.updateMemberRole(memberId, newRole);

    // Log to audit
    await this.dal.auditLogs.log({
      entity: 'organization_member',
      entityId: memberId,
      action: 'update',
      actor: updatedBy,
      diff: {
        role: { old: oldRole, new: newRole },
      },
    });

    return {
      type: 'updated',
      member: updated,
    };
  }

  /**
   * Get invitation by token (for verification)
   * @param {string} token
   * @returns {Object|null}
   */
  getInvitationByToken(token) {
    const invitation = this.dal.organizations.getInvitationByToken(token);
    if (!invitation) {
      return null;
    }

    // Check if expired
    if (new Date(invitation.expiresAt) < new Date() && invitation.status === 'pending') {
      this.dal.organizations.markInvitationExpired(invitation.id);
      return { ...invitation, status: 'expired' };
    }

    return invitation;
  }

  /**
   * Generate invite link (placeholder - actual URL will depend on frontend routing)
   * @param {string} token
   * @returns {string}
   */
  _generateInviteLink(token) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${baseUrl}/accept-invitation?token=${token}`;
  }
}
