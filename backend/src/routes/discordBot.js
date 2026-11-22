/**
 * Discord bot webhook routes (#1349).
 *
 * POST /discord/interactions — entry point for Discord slash-commands.
 * Currently handles `/trivela-stats`, returning real-time campaign metrics.
 */

import { Router } from 'express';

/**
 * @param {{
 *   discordBotService: ReturnType<import('../services/discordBotService.js').createDiscordBotService>,
 *   verifyDiscordSignature?: import('express').RequestHandler,
 * }} deps
 * @returns {import('express').Router}
 */
export function createDiscordBotRoutes({ discordBotService, verifyDiscordSignature } = {}) {
  const router = Router();

  // Discord requires a PING interaction to be answered with PONG type 1.
  // Subsequent commands arrive as type 2 (APPLICATION_COMMAND).
  router.post(
    '/interactions',
    ...(verifyDiscordSignature ? [verifyDiscordSignature] : []),
    (req, res) => {
      const body = req.body ?? {};

      if (body.type === 1) {
        return res.json({ type: 1 });
      }

      const commandName = body.data?.name ?? body.command ?? '';

      if (commandName === 'trivela-stats') {
        return res.json(discordBotService.buildStatsResponse());
      }

      return res.json({
        type: 4,
        data: { content: `Unknown command: \`/${commandName}\`. Try \`/trivela-stats\`.` },
      });
    },
  );

  return router;
}
