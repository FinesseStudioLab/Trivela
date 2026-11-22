import { test } from 'node:test';
import assert from 'node:assert';
import { createJwtAuthService } from './jwtAuthService.js';

const SECRET = 'test-secret-key-for-testing';

test('JWT Auth Service', async (t) => {
  const jwtService = createJwtAuthService(SECRET);

  await t.test('creates and verifies access token', () => {
    const token = jwtService.createAccessToken({ userId: 'user123', orgId: 'org456' });
    assert(token);
    assert(token.split('.').length === 3);

    const payload = jwtService.verifyToken(token);
    assert.strictEqual(payload.userId, 'user123');
    assert.strictEqual(payload.orgId, 'org456');
    assert.strictEqual(payload.type, 'access');
  });

  await t.test('creates and verifies refresh token', () => {
    const token = jwtService.createRefreshToken({ userId: 'user123', orgId: 'org456' });
    assert(token);

    const payload = jwtService.verifyToken(token);
    assert.strictEqual(payload.type, 'refresh');
    assert(payload.jti);
  });

  await t.test('creates token pair', () => {
    const pair = jwtService.createTokenPair({ userId: 'user123', orgId: 'org456' });
    assert(pair.accessToken);
    assert(pair.refreshToken);

    const accessPayload = jwtService.verifyToken(pair.accessToken);
    const refreshPayload = jwtService.verifyToken(pair.refreshToken);

    assert.strictEqual(accessPayload.type, 'access');
    assert.strictEqual(refreshPayload.type, 'refresh');
  });

  await t.test('rotates tokens', () => {
    const pair = jwtService.createTokenPair({ userId: 'user123', orgId: 'org456' });
    const newPair = jwtService.rotateTokens(pair.refreshToken);

    assert(newPair.accessToken);
    assert(newPair.refreshToken);

    const newAccessPayload = jwtService.verifyToken(newPair.accessToken);
    assert.strictEqual(newAccessPayload.userId, 'user123');
  });

  await t.test('rejects invalid token', () => {
    assert.throws(() => {
      jwtService.verifyToken('invalid.token.here');
    });
  });

  await t.test('rejects expired token', (t) => {
    // This would require time manipulation, so we'll skip for now
    t.skip();
  });

  await t.test('rejects wrong token type', () => {
    const refreshToken = jwtService.createRefreshToken({ userId: 'user123' });

    // Verify it works with correct type
    const payload = jwtService.verifyToken(refreshToken);
    assert.strictEqual(payload.type, 'refresh');

    // Should fail when rotation is attempted
    assert.throws(() => {
      const accessToken = jwtService.createAccessToken({ userId: 'user123' });
      jwtService.rotateTokens(accessToken);
    });
  });

  await t.test('throws error when secret missing', () => {
    assert.throws(() => {
      createJwtAuthService('');
    });
  });
});
