// @ts-check
//
// Unit tests for the RBAC middleware (#608).
//
// Covers:
//   - ROLE_PERMISSIONS shape: every role grants at least its own permissions
//   - requirePermission allows callers whose role grants the perm
//   - requirePermission blocks callers with insufficient role (403 INSUFFICIENT_ROLE)
//   - requirePermission blocks callers with no org role at all (403 NO_ORG_ROLE)
//   - role hierarchy: owner is a superset of admin, admin of editor, editor of viewer

import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePermission, ROLE_PERMISSIONS, ROLES } from './rbac.js';

/** @param {{ orgRole?: string }} [opts] */
function makeReqRes({ orgRole } = {}) {
  const req = /** @type {{ auth?: { orgRole?: string } }} */ ({ auth: { orgRole } });
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

function runMiddleware(perm, orgRole) {
  const { req, res } = makeReqRes({ orgRole });
  let called = false;
  const next = () => {
    called = true;
  };
  requirePermission(perm)(req, res, next);
  return { res, called };
}

// ── ROLE_PERMISSIONS shape ─────────────────────────────────────────────────

test('ROLES contains all four expected values', () => {
  assert.deepEqual([...ROLES].sort(), ['admin', 'editor', 'owner', 'viewer']);
});

test('every role in ROLES has a non-empty permissions list', () => {
  for (const role of ROLES) {
    assert.ok(
      Array.isArray(ROLE_PERMISSIONS[role]) && ROLE_PERMISSIONS[role].length > 0,
      `role "${role}" must have at least one permission`,
    );
  }
});

test('owner permissions are a superset of admin permissions', () => {
  const ownerSet = new Set(ROLE_PERMISSIONS.owner);
  for (const perm of ROLE_PERMISSIONS.admin) {
    assert.ok(ownerSet.has(perm), `owner missing "${perm}" that admin has`);
  }
});

test('admin permissions are a superset of editor permissions', () => {
  const adminSet = new Set(ROLE_PERMISSIONS.admin);
  for (const perm of ROLE_PERMISSIONS.editor) {
    assert.ok(adminSet.has(perm), `admin missing "${perm}" that editor has`);
  }
});

test('editor permissions are a superset of viewer permissions', () => {
  const editorSet = new Set(ROLE_PERMISSIONS.editor);
  for (const perm of ROLE_PERMISSIONS.viewer) {
    assert.ok(editorSet.has(perm), `editor missing "${perm}" that viewer has`);
  }
});

// ── Default-deny: no org role ──────────────────────────────────────────────

test('requirePermission returns 403 NO_ORG_ROLE when req.auth has no orgRole', () => {
  const { req, res } = makeReqRes({ orgRole: undefined });
  let called = false;
  requirePermission('campaigns:read')(req, res, () => {
    called = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'NO_ORG_ROLE');
  assert.equal(called, false);
});

test('requirePermission returns 403 NO_ORG_ROLE when req.auth is absent', () => {
  const req = {};
  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let called = false;
  requirePermission('campaigns:read')(req, res, () => {
    called = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'NO_ORG_ROLE');
  assert.equal(called, false);
});

// ── viewer ─────────────────────────────────────────────────────────────────

test('viewer can campaigns:read', () => {
  const { called } = runMiddleware('campaigns:read', 'viewer');
  assert.equal(called, true);
});

test('viewer cannot campaigns:write', () => {
  const { res, called } = runMiddleware('campaigns:write', 'viewer');
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'INSUFFICIENT_ROLE');
  assert.equal(called, false);
});

test('viewer cannot members:manage', () => {
  const { res, called } = runMiddleware('members:manage', 'viewer');
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test('viewer cannot org:delete', () => {
  const { res, called } = runMiddleware('org:delete', 'viewer');
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

// ── editor ─────────────────────────────────────────────────────────────────

test('editor can campaigns:read', () => {
  assert.equal(runMiddleware('campaigns:read', 'editor').called, true);
});

test('editor can campaigns:write', () => {
  assert.equal(runMiddleware('campaigns:write', 'editor').called, true);
});

test('editor cannot members:manage', () => {
  const { res, called } = runMiddleware('members:manage', 'editor');
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test('editor cannot org:delete', () => {
  const { res, called } = runMiddleware('org:delete', 'editor');
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

// ── admin ──────────────────────────────────────────────────────────────────

test('admin can campaigns:write', () => {
  assert.equal(runMiddleware('campaigns:write', 'admin').called, true);
});

test('admin can members:manage', () => {
  assert.equal(runMiddleware('members:manage', 'admin').called, true);
});

test('admin can apikeys:manage', () => {
  assert.equal(runMiddleware('apikeys:manage', 'admin').called, true);
});

test('admin cannot org:delete', () => {
  const { res, called } = runMiddleware('org:delete', 'admin');
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

// ── owner ──────────────────────────────────────────────────────────────────

test('owner can campaigns:write', () => {
  assert.equal(runMiddleware('campaigns:write', 'owner').called, true);
});

test('owner can members:manage', () => {
  assert.equal(runMiddleware('members:manage', 'owner').called, true);
});

test('owner can org:delete', () => {
  assert.equal(runMiddleware('org:delete', 'owner').called, true);
});

test('owner can org:manage', () => {
  assert.equal(runMiddleware('org:manage', 'owner').called, true);
});

// ── Unknown permission ─────────────────────────────────────────────────────

test('requirePermission denies all roles for an unknown permission string', () => {
  for (const role of ROLES) {
    const { res, called } = runMiddleware('nonexistent:perm', role);
    assert.equal(res.statusCode, 403, `role "${role}" should not have "nonexistent:perm"`);
    assert.equal(called, false);
  }
});
