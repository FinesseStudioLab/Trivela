import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Keypair, Networks, TransactionBuilder, Operation } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { createSep10AuthRoutes } from '../routes/sep10Auth.js';
import { createRequireWalletAuth } from '../middleware/walletAuth.js';

const TEST_JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!';
const TEST_PASSPHRASE = Networks.TESTNET;

describe('SEP-10 Auth', () => {
  let serverKeypair;
  let app;
  let httpServer;
  let baseUrl;

  before(async () => {
    serverKeypair = Keypair.random();

    app = express();
    app.use(express.json());

    const authRoutes = createSep10AuthRoutes({
      serverKeypair,
      networkPassphrase: TEST_PASSPHRASE,
      jwtSecret: TEST_JWT_SECRET,
    });

    app.use('/auth/sep10', authRoutes);

    const walletAuth = createRequireWalletAuth({ jwtSecret: TEST_JWT_SECRET });
    app.get('/protected', walletAuth, (req, res) => {
      res.json({ walletAddress: req.auth.walletAddress });
    });

    await new Promise((resolve) => {
      httpServer = app.listen(0, () => {
        baseUrl = `http://localhost:${httpServer.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    httpServer?.close();
  });

  describe('GET /auth/sep10/challenge', () => {
    it('returns a valid challenge transaction', async () => {
      const account = Keypair.random().publicKey();
      const res = await fetch(`${baseUrl}/auth/sep10/challenge?account=${account}`);

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.transaction, 'should have transaction');
      assert.ok(body.networkPassphrase, 'should have networkPassphrase');
      assert.ok(body.serverSignature, 'should have serverSignature');
    });

    it('rejects missing account parameter', async () => {
      const res = await fetch(`${baseUrl}/auth/sep10/challenge`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid account format', async () => {
      const res = await fetch(`${baseUrl}/auth/sep10/challenge?account=invalid`);
      assert.equal(res.status, 400);
    });
  });

  describe('POST /auth/sep10/token', () => {
    it('issues a JWT for a valid signed challenge', async () => {
      const userKeypair = Keypair.random();
      const account = userKeypair.publicKey();

      const challengeRes = await fetch(`${baseUrl}/auth/sep10/challenge?account=${account}`);
      const { transaction: challengeXdr } = await challengeRes.json();

      const tx = TransactionBuilder.fromXDR(challengeXdr, TEST_PASSPHRASE);
      tx.sign(serverKeypair, userKeypair);
      const signedXdr = tx.toEnvelope().toXDR('base64');

      const tokenRes = await fetch(`${baseUrl}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr, account }),
      });

      assert.equal(tokenRes.status, 200);
      const body = await tokenRes.json();
      assert.ok(body.token, 'should have token');
      assert.ok(body.refreshToken, 'should have refreshToken');
      assert.equal(body.account, account);
    });

    it('rejects missing transaction field', async () => {
      const res = await fetch(`${baseUrl}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
    });

    it('rejects replayed nonce', async () => {
      const userKeypair = Keypair.random();
      const account = userKeypair.publicKey();

      const challengeRes = await fetch(`${baseUrl}/auth/sep10/challenge?account=${account}`);
      const { transaction: challengeXdr } = await challengeRes.json();

      const tx = TransactionBuilder.fromXDR(challengeXdr, TEST_PASSPHRASE);
      tx.sign(serverKeypair, userKeypair);
      const signedXdr = tx.toEnvelope().toXDR('base64');

      await fetch(`${baseUrl}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr, account }),
      });

      const replayRes = await fetch(`${baseUrl}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr, account }),
      });

      assert.equal(replayRes.status, 401);
      const body = await replayRes.json();
      assert.equal(body.code, 'REPLAY_DETECTED');
    });
  });

  describe('POST /auth/sep10/refresh', () => {
    it('returns a new token pair for a valid refresh token', async () => {
      const userKeypair = Keypair.random();
      const account = userKeypair.publicKey();

      const challengeRes = await fetch(`${baseUrl}/auth/sep10/challenge?account=${account}`);
      const { transaction: challengeXdr } = await challengeRes.json();

      const tx = TransactionBuilder.fromXDR(challengeXdr, TEST_PASSPHRASE);
      tx.sign(serverKeypair, userKeypair);
      const signedXdr = tx.toEnvelope().toXDR('base64');

      const tokenRes = await fetch(`${baseUrl}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr, account }),
      });
      const { refreshToken } = await tokenRes.json();

      const refreshRes = await fetch(`${baseUrl}/auth/sep10/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      assert.equal(refreshRes.status, 200);
      const body = await refreshRes.json();
      assert.ok(body.token);
      assert.ok(body.refreshToken);
    });

    it('rejects invalid refresh token', async () => {
      const res = await fetch(`${baseUrl}/auth/sep10/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'invalid-token' }),
      });

      assert.equal(res.status, 401);
    });
  });

  describe('requireWalletAuth middleware', () => {
    it('allows access with a valid wallet JWT', async () => {
      const userKeypair = Keypair.random();
      const account = userKeypair.publicKey();

      const challengeRes = await fetch(`${baseUrl}/auth/sep10/challenge?account=${account}`);
      const { transaction: challengeXdr } = await challengeRes.json();

      const tx = TransactionBuilder.fromXDR(challengeXdr, TEST_PASSPHRASE);
      tx.sign(serverKeypair, userKeypair);
      const signedXdr = tx.toEnvelope().toXDR('base64');

      const tokenRes = await fetch(`${baseUrl}/auth/sep10/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr, account }),
      });
      const { token } = await tokenRes.json();

      const protectedRes = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(protectedRes.status, 200);
      const body = await protectedRes.json();
      assert.equal(body.walletAddress, account);
    });

    it('rejects requests without Authorization header', async () => {
      const res = await fetch(`${baseUrl}/protected`);
      assert.equal(res.status, 401);
    });

    it('rejects requests with invalid token', async () => {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      assert.equal(res.status, 401);
    });
  });
});
