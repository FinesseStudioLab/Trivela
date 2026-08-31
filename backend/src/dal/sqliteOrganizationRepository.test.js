import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { SqliteOrganizationRepository } from './sqliteOrganizationRepository.js';

describe('SqliteOrganizationRepository', () => {
  let db;
  let repo;

  before(async () => {
    db = new Database(':memory:');
    await runMigrations(db);
    repo = new SqliteOrganizationRepository(db);
  });

  after(() => {
    db?.close();
  });

  describe('Organizations', () => {
    it('should create and retrieve an organization', () => {
      const org = repo.createOrganization({ name: 'Test Org' });

      assert.ok(org.id);
      assert.strictEqual(org.name, 'Test Org');
      assert.ok(org.slug);
      assert.ok(org.createdAt);
      assert.ok(org.updatedAt);

      const retrieved = repo.getOrganizationById(org.id);
      assert.deepStrictEqual(retrieved, org);
    });

    it('should get organization by slug', () => {
      const org = repo.createOrganization({ name: 'Test Org 2', slug: 'test-org-2' });

      const retrieved = repo.getOrganizationBySlug('test-org-2');
      assert.deepStrictEqual(retrieved, org);
    });

    it('should update organization', () => {
      const org = repo.createOrganization({ name: 'Original Name' });
      const updated = repo.updateOrganization(org.id, { name: 'Updated Name' });

      assert.strictEqual(updated.name, 'Updated Name');
      assert.strictEqual(updated.id, org.id);
    });

    it('should delete organization', () => {
      const org = repo.createOrganization({ name: 'To Delete' });
      const deleted = repo.deleteOrganization(org.id);

      assert.strictEqual(deleted, true);

      const retrieved = repo.getOrganizationById(org.id);
      assert.strictEqual(retrieved, null);
    });
  });

  describe('Members', () => {
    let org;

    before(() => {
      org = repo.createOrganization({ name: 'Test Org for Members' });
    });

    it('should add a member', () => {
      const member = repo.addMember({
        organizationId: org.id,
        userEmail: 'test@example.com',
        role: 'owner',
      });

      assert.ok(member.id);
      assert.strictEqual(member.organizationId, org.id);
      assert.strictEqual(member.userEmail, 'test@example.com');
      assert.strictEqual(member.role, 'owner');
      assert.ok(member.joinedAt);
    });

    it('should list members', () => {
      const members = repo.listMembers(org.id);
      assert.strictEqual(members.length, 1);
      assert.strictEqual(members[0].userEmail, 'test@example.com');
    });

    it('should get member by organization and email', () => {
      const member = repo.getMemberByOrgAndEmail(org.id, 'test@example.com');
      assert.ok(member);
      assert.strictEqual(member.userEmail, 'test@example.com');
    });

    it('should count owners', () => {
      const count = repo.countOwners(org.id);
      assert.strictEqual(count, 1);
    });

    it('should update member role', () => {
      repo.addMember({
        organizationId: org.id,
        userEmail: 'admin@example.com',
        role: 'admin',
      });

      const member = repo.getMemberByOrgAndEmail(org.id, 'admin@example.com');
      const updated = repo.updateMemberRole(member.id, 'member');

      assert.strictEqual(updated.role, 'member');
    });

    it('should remove member', () => {
      const member = repo.addMember({
        organizationId: org.id,
        userEmail: 'temp@example.com',
        role: 'member',
      });

      const removed = repo.removeMember(member.id);
      assert.strictEqual(removed, true);

      const retrieved = repo.getMemberById(member.id);
      assert.strictEqual(retrieved, null);
    });
  });

  describe('Invitations', () => {
    let org;

    before(() => {
      org = repo.createOrganization({ name: 'Test Org for Invitations' });
    });

    it('should create an invitation', () => {
      const invitation = repo.createInvitation({
        organizationId: org.id,
        email: 'invite@example.com',
        role: 'member',
        invitedBy: 'owner@example.com',
      });

      assert.ok(invitation.id);
      assert.strictEqual(invitation.organizationId, org.id);
      assert.strictEqual(invitation.email, 'invite@example.com');
      assert.strictEqual(invitation.role, 'member');
      assert.strictEqual(invitation.invitedBy, 'owner@example.com');
      assert.ok(invitation.token);
      assert.ok(invitation.invitedAt);
      assert.ok(invitation.expiresAt);
      assert.strictEqual(invitation.status, 'pending');
    });

    it('should get invitation by token', () => {
      const invitation = repo.createInvitation({
        organizationId: org.id,
        email: 'token@example.com',
        role: 'admin',
        invitedBy: 'owner@example.com',
      });

      const retrieved = repo.getInvitationByToken(invitation.token);
      assert.deepStrictEqual(retrieved, invitation);
    });

    it('should list invitations', () => {
      const invitations = repo.listInvitations(org.id);
      assert.ok(invitations.length >= 2);
    });

    it('should filter invitations by status', () => {
      const pending = repo.listInvitations(org.id, { status: 'pending' });
      assert.ok(pending.every((inv) => inv.status === 'pending'));
    });

    it('should accept invitation', () => {
      const invitation = repo.createInvitation({
        organizationId: org.id,
        email: 'accept@example.com',
        role: 'member',
        invitedBy: 'owner@example.com',
      });

      const accepted = repo.acceptInvitation(invitation.id);
      assert.strictEqual(accepted.status, 'accepted');
      assert.ok(accepted.acceptedAt);
    });

    it('should revoke invitation', () => {
      const invitation = repo.createInvitation({
        organizationId: org.id,
        email: 'revoke@example.com',
        role: 'member',
        invitedBy: 'owner@example.com',
      });

      const revoked = repo.revokeInvitation(invitation.id);
      assert.strictEqual(revoked.status, 'revoked');
      assert.ok(revoked.revokedAt);
    });

    it('should mark invitation as expired', () => {
      const invitation = repo.createInvitation({
        organizationId: org.id,
        email: 'expired@example.com',
        role: 'member',
        invitedBy: 'owner@example.com',
      });

      const expired = repo.markInvitationExpired(invitation.id);
      assert.strictEqual(expired.status, 'expired');
    });
  });
});
