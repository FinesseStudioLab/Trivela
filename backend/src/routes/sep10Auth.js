import { Router } from 'express';
import crypto from 'node:crypto';
import { Keypair, TransactionBuilder, Networks, Operation, TimeBounds } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';
const NONCE_TTL_SECONDS = 600;

function generateNonce() {
  return crypto.randomBytes(32).toString('base64');
}

function createNonceStore() {
  const used = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [key, expiresAt] of used) {
      if (expiresAt < now) used.delete(key);
    }
  }

  setInterval(cleanup, 60_000).unref?.();

  return {
    markUsed(nonce) {
      used.set(nonce, Date.now() + NONCE_TTL_SECONDS * 1000);
    },
    isUsed(nonce) {
      return used.has(nonce);
    },
  };
}

export function createSep10AuthRoutes({
  serverKeypair,
  networkPassphrase,
  jwtSecret,
  nonceStore,
}) {
  const router = Router();
  const store = nonceStore || createNonceStore();

  function getServerKeypair() {
    if (serverKeypair instanceof Keypair) return serverKeypair;
    const secret = process.env.TRIVELA_SEP10_SECRET;
    if (!secret) throw new Error('TRIVELA_SEP10_SECRET not configured');
    return Keypair.fromSecret(secret);
  }

  function getJwtSecret() {
    if (jwtSecret) return jwtSecret;
    const secret = process.env.TRIVELA_JWT_SECRET;
    if (!secret) throw new Error('TRIVELA_JWT_SECRET not configured');
    return secret;
  }

  function getNetworkPassphrase() {
    if (networkPassphrase) return networkPassphrase;
    return process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
  }

  router.get('/challenge', (req, res) => {
    try {
      const account = req.query.account;
      if (!account || typeof account !== 'string') {
        return res.status(400).json({
          error: 'Missing required query parameter: account',
          code: 'VALIDATION_ERROR',
        });
      }

      if (!account.startsWith('G') || account.length !== 56) {
        return res.status(400).json({
          error: 'Invalid Stellar account address',
          code: 'VALIDATION_ERROR',
        });
      }

      const serverKP = getServerKeypair();
      const passphrase = getNetworkPassphrase();
      const nonce = generateNonce();

      const now = Math.floor(Date.now() / 1000);
      const timeBounds = new TimeBounds({
        minTime: now,
        maxTime: now + Math.floor(CHALLENGE_TTL_MS / 1000),
      });

      const transaction = new TransactionBuilder(
        new account === serverKP.publicKey() ? serverKP : { publicKey: () => account, signatureHint: () => Buffer.alloc(4) },
        {
          fee: '0',
          timebounds: timeBounds,
          networkPassphrase: passphrase,
        },
      )
        .addOperation(
          Operation.manageData({
            name: 'auth',
            value: Buffer.from(nonce, 'utf-8'),
          }),
        )
        .build();

      transaction.sign(serverKP);

      const challengeXdr = transaction.toEnvelope().toXDR('base64');

      res.json({
        transaction: challengeXdr,
        serverSignature: serverKP.signatureHint().toString('base64'),
        networkPassphrase: passphrase,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to generate challenge',
        code: 'CHALLENGE_ERROR',
      });
    }
  });

  router.post('/token', async (req, res) => {
    try {
      const { transaction: signedXdr, account } = req.body;

      if (!signedXdr || typeof signedXdr !== 'string') {
        return res.status(400).json({
          error: 'Missing required field: transaction',
          code: 'VALIDATION_ERROR',
        });
      }

      if (!account || typeof account !== 'string') {
        return res.status(400).json({
          error: 'Missing required field: account',
          code: 'VALIDATION_ERROR',
        });
      }

      const passphrase = getNetworkPassphrase();
      const serverKP = getServerKeypair();

      let transaction;
      try {
        const tx = new TransactionBuilder(
          { publicKey: () => account, signatureHint: () => Buffer.alloc(4) },
          { fee: '0', networkPassphrase: passphrase },
        );
        transaction = TransactionBuilder.fromXDR(signedXdr, passphrase);
      } catch {
        return res.status(400).json({
          error: 'Invalid transaction XDR',
          code: 'INVALID_TRANSACTION',
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const timeBounds = transaction.timeBounds;
      if (!timeBounds) {
        return res.status(400).json({
          error: 'Transaction must have timebounds',
          code: 'INVALID_TRANSACTION',
        });
      }
      if (now < Number(timeBounds.minTime) || now > Number(timeBounds.maxTime)) {
        return res.status(401).json({
          error: 'Challenge has expired or is not yet valid',
          code: 'CHALLENGE_EXPIRED',
        });
      }

      const serverSigValid = transaction.signatures.some((sig) => {
        try {
          return serverKP.verify(
            transaction.hash(),
            sig.hint().equals(serverKP.signatureHint()) ? sig.signature() : null,
          );
        } catch {
          return false;
        }
      });

      if (!serverSigValid) {
        return res.status(401).json({
          error: 'Server signature is missing or invalid',
          code: 'INVALID_SERVER_SIGNATURE',
        });
      }

      const ops = transaction.operations;
      if (ops.length !== 1 || ops[0].type !== 'manageData') {
        return res.status(401).json({
          error: 'Challenge transaction must contain exactly one manage_data operation',
          code: 'INVALID_CHALLENGE',
        });
      }

      const manageDataOp = ops[0];
      if (manageDataOp.name !== 'auth') {
        return res.status(401).json({
          error: 'Challenge operation must be manage_data with name "auth"',
          code: 'INVALID_CHALLENGE',
        });
      }

      const nonce = Buffer.from(manageDataOp.value).toString('utf-8');
      if (store.isUsed(nonce)) {
        return res.status(401).json({
          error: 'Challenge nonce has already been used',
          code: 'REPLAY_DETECTED',
        });
      }

      store.markUsed(nonce);

      const secret = getJwtSecret();
      const token = jwt.sign(
        { sub: account, type: 'wallet' },
        secret,
        { expiresIn: TOKEN_EXPIRY },
      );

      const refreshToken = jwt.sign(
        { sub: account, type: 'refresh' },
        secret,
        { expiresIn: REFRESH_EXPIRY },
      );

      res.json({ token, refreshToken, account });
    } catch (error) {
      res.status(500).json({
        error: 'Token issuance failed',
        code: 'TOKEN_ERROR',
      });
    }
  });

  router.post('/refresh', (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(400).json({
          error: 'Missing required field: refreshToken',
          code: 'VALIDATION_ERROR',
        });
      }

      const secret = getJwtSecret();
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, secret);
      } catch {
        return res.status(401).json({
          error: 'Invalid or expired refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        });
      }

      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          error: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE',
        });
      }

      const token = jwt.sign(
        { sub: decoded.sub, type: 'wallet' },
        secret,
        { expiresIn: TOKEN_EXPIRY },
      );

      const newRefreshToken = jwt.sign(
        { sub: decoded.sub, type: 'refresh' },
        secret,
        { expiresIn: REFRESH_EXPIRY },
      );

      res.json({ token, refreshToken: newRefreshToken, account: decoded.sub });
    } catch (error) {
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'TOKEN_ERROR',
      });
    }
  });

  return router;
}
