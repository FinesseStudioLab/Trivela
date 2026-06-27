import jwt from 'jsonwebtoken';

function getJwtSecret() {
  return process.env.TRIVELA_JWT_SECRET || '';
}

/**
 * Middleware that validates a JWT issued by the SEP-10 auth flow.
 * Attaches the authenticated wallet address to `req.auth.walletAddress`.
 *
 * @param {{ jwtSecret?: string }} [options]
 */
export function createRequireWalletAuth({ jwtSecret } = {}) {
  const secret = jwtSecret || getJwtSecret();

  return function requireWalletAuth(req, res, next) {
    if (!secret) {
      return res.status(503).json({
        error: 'Wallet authentication is not configured',
        code: 'WALLET_AUTH_NOT_CONFIGURED',
      });
    }

    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.trim()) {
      return res.status(401).json({
        error: 'Authorization header required',
        code: 'UNAUTHORIZED',
      });
    }

    const match = authorization.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (!match?.[1]) {
      return res.status(401).json({
        error: 'Invalid Authorization header format',
        code: 'UNAUTHORIZED',
      });
    }

    const token = match[1].trim();

    try {
      const decoded = jwt.verify(token, secret);

      if (decoded.type !== 'wallet') {
        return res.status(401).json({
          error: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE',
        });
      }

      req.auth = {
        ...req.auth,
        type: 'wallet',
        walletAddress: decoded.sub,
        tokenExp: decoded.exp,
      };

      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED',
        });
      }

      return res.status(401).json({
        error: 'Invalid or forged token',
        code: 'INVALID_TOKEN',
      });
    }
  };
}
