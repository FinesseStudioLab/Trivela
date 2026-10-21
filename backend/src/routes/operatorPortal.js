/**
 * Operator portal routes for JWT authentication and dashboard access.
 */

import { createJwtAuthService, createJwtMiddleware } from '../services/jwtAuthService.js';

export function createOperatorPortalRoutes(app, { jwtSecret = process.env.JWT_SECRET || '' } = {}) {
  const jwtService = createJwtAuthService(jwtSecret);
  const jwtMiddleware = createJwtMiddleware(jwtService);

  /**
   * POST /operator/login - Login endpoint
   * @body {userId: string, orgId: string, scope?: string}
   * @returns {accessToken, refreshToken}
   */
  app.post('/operator/login', (req, res) => {
    const { userId, orgId, scope } = req.body;

    if (!userId || !orgId) {
      return res.status(400).json({
        error: 'userId and orgId are required',
        code: 'INVALID_REQUEST',
      });
    }

    try {
      const tokens = jwtService.createTokenPair({ userId, orgId, scope });
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ accessToken: tokens.accessToken });
    } catch (err) {
      res.status(500).json({ error: err.message, code: 'TOKEN_CREATION_FAILED' });
    }
  });

  /**
   * POST /operator/refresh - Refresh access token
   * @returns {accessToken}
   */
  app.post('/operator/refresh', (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token not found',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      const tokens = jwtService.rotateTokens(refreshToken);
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ accessToken: tokens.accessToken });
    } catch (err) {
      res.status(401).json({ error: err.message, code: 'UNAUTHORIZED' });
    }
  });

  /**
   * POST /operator/logout - Logout endpoint
   */
  app.post('/operator/logout', (req, res) => {
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  });

  /**
   * GET /operator/profile - Get operator profile (protected)
   */
  app.get('/operator/profile', jwtMiddleware, (req, res) => {
    res.json({
      userId: req.auth.userId,
      orgId: req.auth.orgId,
      scope: req.auth.scope,
    });
  });

  return { jwtService, jwtMiddleware };
}
