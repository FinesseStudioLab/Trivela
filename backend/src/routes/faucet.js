/**
 * Faucet route for testnet account funding
 * Provides in-app friendbot trigger with rate limits and abuse guards
 */

import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { log } from '../middleware/logger.js';
import { resolveStellarNetworkConfig } from '../config/stellarNetwork.js';

const router = Router();

// Rate limiting: 5 requests per hour per IP
const faucetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyPrefix: 'faucet',
});

const faucetRequestSchema = z.object({
  publicKey: z
    .string()
    .length(56)
    .regex(/^G[A-Z0-9]{55}$/),
});

/**
 * POST /api/v1/faucet/fund
 * Funds a testnet account using Friendbot
 */
router.post('/fund', faucetLimiter, async (req, res) => {
  try {
    const { publicKey } = faucetRequestSchema.parse(req.body);
    const networkConfig = resolveStellarNetworkConfig();

    // Only allow faucet on testnet
    if (networkConfig.network !== 'testnet') {
      return res.status(400).json({
        error: 'Faucet is only available on testnet',
        network: networkConfig.network,
      });
    }

    // Call Stellar Friendbot
    const friendbotUrl = `https://friendbot.stellar.org?addr=${publicKey}`;
    const response = await fetch(friendbotUrl);

    if (!response.ok) {
      const error = await response.json();
      log.error('Friendbot request failed', { publicKey, error });
      return res.status(response.status).json({
        error: 'Failed to fund account',
        details: error,
      });
    }

    const result = await response.json();
    log.info('Account funded via faucet', { publicKey, hash: result.hash });

    res.json({
      success: true,
      publicKey,
      hash: result.hash,
      network: networkConfig.network,
      message: 'Account funded successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.errors,
      });
    }

    log.error('Faucet error', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/faucet/status
 * Returns faucet availability and rate limit info
 */
router.get('/status', (req, res) => {
  const networkConfig = resolveStellarNetworkConfig();

  res.json({
    available: networkConfig.network === 'testnet',
    network: networkConfig.network,
    rateLimit: {
      window: '1 hour',
      maxRequests: 5,
    },
  });
});

export default router;
