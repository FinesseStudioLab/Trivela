/**
 * Telegram bot webhook routes (#1350).
 *
 * POST /telegram/webhook — entry point for Telegram bot updates.
 * Currently handles `/claim`, returning claimable reward balances.
 */

import { Router } from 'express';

/**
 * @param {{
 *   telegramBotService: ReturnType<import('../services/telegramBotService.js').createTelegramBotService>,
 *   verifyTelegramSecret?: import('express').RequestHandler,
 * }} deps
 * @returns {import('express').Router}
 */
export function createTelegramBotRoutes({ telegramBotService, verifyTelegramSecret } = {}) {
  const router = Router();

  router.post('/webhook', ...(verifyTelegramSecret ? [verifyTelegramSecret] : []), (req, res) => {
    const reply = telegramBotService.handleUpdate(req.body ?? {});

    if (!reply) {
      return res.status(400).json({ error: 'invalid update payload', code: 'VALIDATION_ERROR' });
    }

    // Telegram expects 200 even for replies we send via the Bot API.
    return res.json(reply);
  });

  return router;
}
