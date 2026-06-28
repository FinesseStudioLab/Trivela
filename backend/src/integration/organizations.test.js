import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../index.js';

describe('Organization & Invitation API (Issue #609)', () => {
  let app;
  let server;
  let orgId;
  let invitationToken;
  const API_KEY = 'test-api-key';

  before(async () => {
    app = await createApp({
      dbPath: ':memory:',
      apiKeys: [API_KEY],
      disableJobs: true,
      disableWebSocket: true,
      skipEnvValidation: true,
    });
    server = app.listen(0);
  });

  after(() => {
    server?.close();
  });

  describe('Organization CRUD', () => {
    it('POST /api/v1/organizations - should create organization', async () => {
      const res = await request(app)
        .post('/api/v1/organizations')
        .set('X-API-Key', API_KEY)
        .send({
          name: 'Test Organization',
          slug: 'test-org',
          creatorEmail: 'owner@example.com',
        })
        .expect(201);

      assert.ok(res.body.id);
      assert.strictEqual(res.body.name, 'Test Organization');
      assert.strictEqual(res.body.slug, 'test-org');
      orgId = res.body.id;
    });

    it('GET /api/v1/organizations/:id - should get organization', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}`)
        .set('X-API-Key', API_KEY)
        .expect(200);

      assert.strictEqual(res.body.id, orgId);
      assert.strictEqual(res.body.name, 'Test Organization');
    });

    it('PUT /api/v1/organizations/:id - should update organization', async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${orgId}`)
        .set('X-API-Key', API_KEY)
        .send({ name: 'Updated Organization' })
        .expect(200);

      assert.strictEqual(res.body.name, 'Updated Organization');
    });
  });

  describe('Team Member Management', () => {
    it('GET /api/v1/organizations/:id/members - should list members', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set('X-API-Key', API_KEY)
        .expect(200);

      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 1); // Should have at least the creator
    });
  });

  describe('Invitation Flow', () => {
    it('POST /api/v1/organizations/:id/invitations - should create invitation', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'newmember@example.com',
          role: 'member',
        })
        .expect(201);

      assert.strictEqual(res.body.type, 'invitation_created');
      assert.ok(res.body.invitation);
      assert.ok(res.body.invitation.token);
      assert.ok(res.body.inviteLink);
      assert.strictEqual(res.body.invitation.email, 'newmember@example.com');
      assert.strictEqual(res.body.invitation.role, 'member');
      invitationToken = res.body.invitation.token;
    });

    it('GET /api/v1/organizations/invite/:token - should get invitation details', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/invite/${invitationToken}`)
        .expect(200);

      assert.strictEqual(res.body.email, 'newmember@example.com');
      assert.strictEqual(res.body.role, 'member');
      assert.ok(res.body.organization);
      assert.strictEqual(res.body.status, 'pending');
    });

    it('POST /api/v1/organizations/invite/:token/accept - should accept invitation', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/invite/${invitationToken}/accept`)
        .send({ email: 'newmember@example.com' })
        .expect(200);

      assert.strictEqual(res.body.type, 'accepted');
      assert.ok(res.body.member);
      assert.strictEqual(res.body.member.userEmail, 'newmember@example.com');
      assert.strictEqual(res.body.member.role, 'member');
      assert.ok(res.body.organization);
    });

    it('POST /api/v1/organizations/invite/:token/accept - should reject already accepted invitation', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/invite/${invitationToken}/accept`)
        .send({ email: 'newmember@example.com' })
        .expect(400);

      assert.ok(res.body.error);
      assert.strictEqual(res.body.code, 'INVALID_INVITATION');
    });

    it('GET /api/v1/organizations/:id/invitations - should list invitations', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .expect(200);

      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 1);
    });

    it('GET /api/v1/organizations/:id/invitations?status=accepted - should filter by status', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/invitations?status=accepted`)
        .set('X-API-Key', API_KEY)
        .expect(200);

      assert.ok(res.body.data.every((inv) => inv.status === 'accepted'));
    });
  });

  describe('Invitation Revocation', () => {
    let revokeInvitationId;

    before(async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'revoke@example.com',
          role: 'member',
        });
      revokeInvitationId = res.body.invitation.id;
    });

    it('DELETE /api/v1/organizations/:id/invitations/:invitationId - should revoke invitation', async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${orgId}/invitations/${revokeInvitationId}`)
        .set('X-API-Key', API_KEY)
        .expect(200);

      assert.strictEqual(res.body.type, 'revoked');
      assert.strictEqual(res.body.invitation.status, 'revoked');
    });

    it('DELETE /api/v1/organizations/:id/invitations/:invitationId - should not revoke non-pending invitation', async () => {
      await request(app)
        .delete(`/api/v1/organizations/${orgId}/invitations/${revokeInvitationId}`)
        .set('X-API-Key', API_KEY)
        .expect(400);
    });
  });

  describe('Member Role Management', () => {
    let memberId;

    before(async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set('X-API-Key', API_KEY);
      const member = res.body.data.find((m) => m.userEmail === 'newmember@example.com');
      memberId = member.id;
    });

    it('PUT /api/v1/organizations/:id/members/:memberId - should update member role', async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${orgId}/members/${memberId}`)
        .set('X-API-Key', API_KEY)
        .send({ role: 'admin' })
        .expect(200);

      assert.strictEqual(res.body.role, 'admin');
    });

    it('PUT /api/v1/organizations/:id/members/:memberId - should reject invalid role', async () => {
      await request(app)
        .put(`/api/v1/organizations/${orgId}/members/${memberId}`)
        .set('X-API-Key', API_KEY)
        .send({ role: 'invalid' })
        .expect(400);
    });
  });

  describe('Member Removal', () => {
    let removableMemberId;

    before(async () => {
      // Create a new invitation and accept it
      const inviteRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'removable@example.com',
          role: 'member',
        });

      await request(app)
        .post(`/api/v1/organizations/invite/${inviteRes.body.invitation.token}/accept`)
        .send({ email: 'removable@example.com' });

      const membersRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set('X-API-Key', API_KEY);
      const member = membersRes.body.data.find((m) => m.userEmail === 'removable@example.com');
      removableMemberId = member.id;
    });

    it('DELETE /api/v1/organizations/:id/members/:memberId - should remove member', async () => {
      await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${removableMemberId}`)
        .set('X-API-Key', API_KEY)
        .expect(204);

      // Verify member is removed
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set('X-API-Key', API_KEY);

      const member = res.body.data.find((m) => m.id === removableMemberId);
      assert.strictEqual(member, undefined);
    });
  });

  describe('Edge Cases', () => {
    it('POST /api/v1/organizations/:id/invitations - should handle existing member', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'newmember@example.com', // Already a member
          role: 'member',
        })
        .expect(201);

      assert.strictEqual(res.body.type, 'already_member');
      assert.ok(res.body.member);
    });

    it('POST /api/v1/organizations/invite/:token/accept - should reject wrong email', async () => {
      // Create new invitation
      const inviteRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'specific@example.com',
          role: 'member',
        });

      // Try to accept with different email
      await request(app)
        .post(`/api/v1/organizations/invite/${inviteRes.body.invitation.token}/accept`)
        .send({ email: 'wrong@example.com' })
        .expect(400);
    });

    it('POST /api/v1/organizations/:id/invitations - should update role for existing member via invitation', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'newmember@example.com',
          role: 'owner', // Different role
        })
        .expect(201);

      assert.strictEqual(res.body.type, 'member_updated');
      assert.strictEqual(res.body.member.role, 'owner');
    });

    it('DELETE /api/v1/organizations/:id/members/:memberId - should not remove last owner', async () => {
      // Get the owner
      const membersRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set('X-API-Key', API_KEY);

      // There should be 2 owners now (original + newmember)
      const owners = membersRes.body.data.filter((m) => m.role === 'owner');
      assert.ok(owners.length >= 2);

      // Try to remove one owner (should succeed since there's another)
      await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${owners[0].id}`)
        .set('X-API-Key', API_KEY)
        .expect(204);

      // Now try to remove the last owner (should fail)
      const updatedMembersRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set('X-API-Key', API_KEY);
      const lastOwner = updatedMembersRes.body.data.find((m) => m.role === 'owner');

      await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${lastOwner.id}`)
        .set('X-API-Key', API_KEY)
        .expect(400);
    });
  });

  describe('Validation', () => {
    it('POST /api/v1/organizations - should reject missing name', async () => {
      await request(app)
        .post('/api/v1/organizations')
        .set('X-API-Key', API_KEY)
        .send({})
        .expect(400);
    });

    it('POST /api/v1/organizations/:id/invitations - should reject missing email', async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({ role: 'member' })
        .expect(400);
    });

    it('POST /api/v1/organizations/:id/invitations - should reject invalid role', async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'test@example.com',
          role: 'superadmin',
        })
        .expect(400);
    });

    it('GET /api/v1/organizations/invite/invalid-token - should return 404 for invalid token', async () => {
      await request(app).get('/api/v1/organizations/invite/invalid-token').expect(404);
    });
  });

  describe('Authorization', () => {
    it('POST /api/v1/organizations - should require API key', async () => {
      await request(app).post('/api/v1/organizations').send({ name: 'Test' }).expect(401);
    });

    it('GET /api/v1/organizations/:id - should require API key', async () => {
      await request(app).get(`/api/v1/organizations/${orgId}`).expect(401);
    });

    it('GET /api/v1/organizations/invite/:token - should NOT require API key (public)', async () => {
      // Create a new invitation first
      const inviteRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'public@example.com',
          role: 'member',
        });

      await request(app)
        .get(`/api/v1/organizations/invite/${inviteRes.body.invitation.token}`)
        .expect(200);
    });

    it('POST /api/v1/organizations/invite/:token/accept - should NOT require API key (public)', async () => {
      // Create a new invitation
      const inviteRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set('X-API-Key', API_KEY)
        .send({
          email: 'public2@example.com',
          role: 'member',
        });

      await request(app)
        .post(`/api/v1/organizations/invite/${inviteRes.body.invitation.token}/accept`)
        .send({ email: 'public2@example.com' })
        .expect(200);
    });
  });
});
