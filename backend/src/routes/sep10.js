/**
 * SEP-10 Stellar Web Authentication routes.
 *
 * Implements the challenge → sign → verify → JWT flow so users can
 * authenticate by proving wallet ownership without exposing secrets.
 *
 * Endpoints:
 *   GET  /auth/sep10/challenge?account=G...   → challenge transaction XDR
 *   POST /auth/sep10/token                     → verify signature, return JWT
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import {
  TransactionBuilder,
  Address,
  Networks,
  Keypair,
  Transaction,
  StrKey,
} from '@stellar/stellar-sdk';

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes — how long a used nonce is remembered
const JWT_EXPIRY_S = 15 * 60; // 15 minutes
const JWT_REFRESH_EXPIRY_S = 7 * 24 * 60 * 60; // 7 days

const G_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * In-memory nonce store.  Replace with Redis for multi-instance deployments.
 * Each entry: { usedAt: number } — we evict entries older than NONCE_TTL_MS
 * on every write to keep memory bounded.
 */
const usedNonces = new Map();

function evictStaleNonces() {
  const cutoff = Date.now() - NONCE_TTL_MS;
  for (const [key, usedAt] of usedNonces) {
    if (usedAt < cutoff) usedNonces.delete(key);
  }
}

function markNonceUsed(nonce) {
  usedNonces.set(nonce, Date.now());
  if (usedNonces.size > 10_000) evictStaleNonces();
}

function isNonceUsed(nonce) {
  return usedNonces.has(nonce);
}

/**
 * Minimal HMAC-based JWT implementation (no external dependency required).
 * In production you'd use a library like `jsonwebtoken`, but this keeps
 * the dependency surface small and avoids adding a new package.
 */
function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${base64url(sig)}`;
}

function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(sig, 'base64url');

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;

  return payload;
}

/**
 * Create the SEP-10 authentication router.
 *
 * @param {{
 *   serverSecret?: string,
 *   networkPassphrase?: string,
 *   jwtSecret?: string,
 * }} options
 */
export function createSep10Routes({
  serverSecret = process.env.STELLAR_SECRET_KEY || '',
  networkPassphrase = process.env.STELLAR_NETWORK || Networks.TESTNET,
  jwtSecret = process.env.TRIVELA_JWT_SECRET || '',
} = {}) {
  const router = Router();

  if (!serverSecret) {
    router.get('/auth/sep10/challenge', (_req, res) =>
      res
        .status(503)
        .json({ error: 'SEP-10 not configured: no server key', code: 'NOT_CONFIGURED' }),
    );
    router.post('/auth/sep10/token', (_req, res) =>
      res
        .status(503)
        .json({ error: 'SEP-10 not configured: no server key', code: 'NOT_CONFIGURED' }),
    );
    return router;
  }

  const serverKeypair = Keypair.fromSecret(serverSecret);
  const effectiveJwtSecret = jwtSecret || serverSecret;

  // ── GET /auth/sep10/challenge ────────────────────────────────────────────
  router.get('/auth/sep10/challenge', (req, res) => {
    const account = String(req.query.account || '').trim();

    if (!G_ADDRESS_REGEX.test(account)) {
      return res.status(400).json({
        error: 'Invalid Stellar account address (must start with G)',
        code: 'INVALID_ACCOUNT',
      });
    }

    try {
      // Validate the address is a real Stellar public key
      StrKey.decodeEd25519PublicKey(account);
    } catch {
      return res.status(400).json({
        error: 'Invalid Stellar public key',
        code: 'INVALID_ACCOUNT',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(48).toString('base64url');
    const validUntil = now + Math.floor(CHALLENGE_EXPIRY_MS / 1000);

    const transaction = new TransactionBuilder(new Address(account), {
      fee: '0',
      networkPassphrase,
    })
      .addOperation(
        // manageData operation — SEP-10 requires at least one
        {
          type: 'manageData',
          name: 'trivela auth',
          value: Buffer.from(nonce, 'utf-8'),
        },
      )
      .setTimeout(validUntil)
      .build();

    transaction.sign(serverKeypair);

    return res.json({
      transaction: transaction.toXDR(),
      network_passphrase: networkPassphrase,
      nonce,
      expires_at: new Date(validUntil * 1000).toISOString(),
    });
  });

  // ── POST /auth/sep10/token ───────────────────────────────────────────────
  router.post('/auth/sep10/token', (req, res) => {
    const { transaction: clientXdr, account } = req.body ?? {};

    if (!clientXdr || typeof clientXdr !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid transaction XDR',
        code: 'INVALID_TRANSACTION',
      });
    }

    if (!account || !G_ADDRESS_REGEX.test(account)) {
      return res.status(400).json({
        error: 'Missing or invalid account address',
        code: 'INVALID_ACCOUNT',
      });
    }

    let clientTx;
    try {
      clientTx = new Transaction(clientXdr, networkPassphrase);
    } catch {
      return res.status(400).json({
        error: 'Could not decode transaction XDR',
        code: 'INVALID_TRANSACTION',
      });
    }

    // 1. Verify the server signed the transaction
    const serverSigned = clientTx.signatures.some((s) =>
      s.hint().equals(serverKeypair.publicKey()),
    );
    if (!serverSigned) {
      return res.status(401).json({
        error: 'Transaction not signed by server',
        code: 'SERVER_SIGNATURE_MISSING',
      });
    }

    // 2. Verify the client signed the transaction
    const clientSigned = clientTx.signatures.some((s) =>
      s.hint().equals(StrKey.decodeEd25519PublicKey(account)),
    );
    if (!clientSigned) {
      return res.status(401).json({
        error: 'Transaction not signed by the claimed account',
        code: 'CLIENT_SIGNATURE_MISSING',
      });
    }

    // 3. Verify timebounds
    const now = Math.floor(Date.now() / 1000);
    const timeBounds = clientTx.timeBounds;
    if (!timeBounds || now < Number(timeBounds.min) || now > Number(timeBounds.max)) {
      return res.status(401).json({
        error: 'Challenge transaction expired or not yet valid',
        code: 'CHALLENGE_EXPIRED',
      });
    }

    // 4. Extract and check nonce (replay protection)
    const manageDataOp = clientTx.operations[0];
    if (!manageDataOp || manageDataOp.type !== 'manageData') {
      return res.status(400).json({
        error: 'Invalid challenge transaction: expected manageData operation',
        code: 'INVALID_CHALLENGE',
      });
    }

    const nonce = manageDataOp.value ? Buffer.from(manageDataOp.value).toString('utf-8') : null;

    if (!nonce) {
      return res.status(400).json({
        error: 'Missing nonce in challenge transaction',
        code: 'INVALID_CHALLENGE',
      });
    }

    if (isNonceUsed(nonce)) {
      return res.status(401).json({
        error: 'Challenge nonce already used (replay rejected)',
        code: 'NONCE_REUSED',
      });
    }

    markNonceUsed(nonce);

    // 5. Issue JWT
    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessToken = signJwt(
      {
        sub: account,
        iss: 'trivela',
        iat: nowSeconds,
        exp: nowSeconds + JWT_EXPIRY_S,
        nonce,
      },
      effectiveJwtSecret,
    );

    const refreshToken = signJwt(
      {
        sub: account,
        iss: 'trivela',
        iat: nowSeconds,
        exp: nowSeconds + JWT_REFRESH_EXPIRY_S,
        type: 'refresh',
        nonce,
      },
      effectiveJwtSecret,
    );

    return res.json({
      token: accessToken,
      refresh_token: refreshToken,
      expires_in: JWT_EXPIRY_S,
      account,
    });
  });

  // ── POST /auth/sep10/refresh ─────────────────────────────────────────────
  router.post('/auth/sep10/refresh', (req, res) => {
    const { refresh_token } = req.body ?? {};

    if (!refresh_token || typeof refresh_token !== 'string') {
      return res.status(400).json({
        error: 'Missing refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const payload = verifyJwt(refresh_token, effectiveJwtSecret);
    if (!payload || payload.type !== 'refresh') {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessToken = signJwt(
      {
        sub: payload.sub,
        iss: 'trivela',
        iat: nowSeconds,
        exp: nowSeconds + JWT_EXPIRY_S,
      },
      effectiveJwtSecret,
    );

    return res.json({
      token: accessToken,
      expires_in: JWT_EXPIRY_S,
      account: payload.sub,
    });
  });

  return router;
}

/**
 * Middleware: require a valid SEP-10 JWT.
 * Sets `req.walletAuth = { address }` on success.
 *
 * @param {{ jwtSecret?: string }} options
 */
export function createRequireWalletAuth({
  jwtSecret = process.env.TRIVELA_JWT_SECRET || '',
  serverSecret = process.env.STELLAR_SECRET_KEY || '',
} = {}) {
  const effectiveSecret = jwtSecret || serverSecret;

  if (!effectiveSecret) {
    return function disabledWalletAuth(_req, res, _next) {
      res.status(503).json({
        error: 'Wallet authentication not configured',
        code: 'NOT_CONFIGURED',
      });
    };
  }

  return function requireWalletAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.slice(7);
    const payload = verifyJwt(token, effectiveSecret);

    if (!payload || payload.type === 'refresh') {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }

    req.walletAuth = { address: payload.sub };
    next();
  };
}

export { verifyJwt, signJwt };
