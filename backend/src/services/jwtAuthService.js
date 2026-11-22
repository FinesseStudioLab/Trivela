/**
 * JWT authentication service for operator portal with refresh token rotation.
 * Manages JWT token creation, validation, and refresh token lifecycle.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'HS256';
const TOKEN_EXPIRY = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function createSignature(header, payload, secret) {
  const message = `${header}.${payload}`;
  return crypto.createHmac('sha256', secret).update(message).digest('base64url');
}

export function createJwtAuthService(secret = process.env.JWT_SECRET || '') {
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return {
    /**
     * Create a new access token
     */
    createAccessToken(data = {}) {
      const now = Math.floor(Date.now() / 1000);
      const header = base64UrlEncode(JSON.stringify({ alg: ALGORITHM, typ: 'JWT' }));
      const payload = base64UrlEncode(
        JSON.stringify({
          ...data,
          iat: now,
          exp: now + TOKEN_EXPIRY,
          type: 'access',
        }),
      );
      const signature = createSignature(header, payload, secret);
      return `${header}.${payload}.${signature}`;
    },

    /**
     * Create a new refresh token
     */
    createRefreshToken(data = {}) {
      const now = Math.floor(Date.now() / 1000);
      const jti = crypto.randomBytes(16).toString('hex');
      const header = base64UrlEncode(JSON.stringify({ alg: ALGORITHM, typ: 'JWT' }));
      const payload = base64UrlEncode(
        JSON.stringify({
          ...data,
          jti,
          iat: now,
          exp: now + REFRESH_TOKEN_EXPIRY,
          type: 'refresh',
        }),
      );
      const signature = createSignature(header, payload, secret);
      return `${header}.${payload}.${signature}`;
    },

    /**
     * Verify and decode a token
     */
    verifyToken(token) {
      try {
        const [headerB64, payloadB64, signatureB64] = token.split('.');
        if (!headerB64 || !payloadB64 || !signatureB64) {
          throw new Error('Invalid token format');
        }

        const expectedSignature = createSignature(headerB64, payloadB64, secret);
        if (signatureB64 !== expectedSignature) {
          throw new Error('Invalid signature');
        }

        const payload = JSON.parse(base64UrlDecode(payloadB64));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
          throw new Error('Token expired');
        }

        return payload;
      } catch (err) {
        throw new Error(`Token verification failed: ${err.message}`);
      }
    },

    /**
     * Create a token pair (access + refresh)
     */
    createTokenPair(data = {}) {
      const cleanData = { ...data };
      delete cleanData.type;
      delete cleanData.exp;
      delete cleanData.iat;
      delete cleanData.jti;

      return {
        accessToken: this.createAccessToken(cleanData),
        refreshToken: this.createRefreshToken(cleanData),
      };
    },

    /**
     * Rotate tokens (use refresh token to get new access token)
     */
    rotateTokens(refreshToken) {
      const payload = this.verifyToken(refreshToken);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type: expected refresh token');
      }

      const cleanData = { ...payload };
      delete cleanData.type;
      delete cleanData.exp;
      delete cleanData.iat;
      delete cleanData.jti;

      return {
        accessToken: this.createAccessToken(cleanData),
        refreshToken: this.createRefreshToken(cleanData),
      };
    },
  };
}

export function createJwtMiddleware(jwtService) {
  return function requireJwt(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header', code: 'UNAUTHORIZED' });
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwtService.verifyToken(token);
      req.auth = {
        type: 'jwt',
        userId: payload.userId,
        orgId: payload.orgId,
        scope: payload.scope,
        payload,
      };
      next();
    } catch (err) {
      res.status(401).json({ error: err.message, code: 'UNAUTHORIZED' });
    }
  };
}
