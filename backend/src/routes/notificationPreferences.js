// @ts-check
import express from 'express';
import { z } from 'zod';

const CHANNELS = ['email', 'push', 'in_app'];

const setPrefsBody = z.object({
  userAddress: z.string().min(1),
  preferences: z
    .array(
      z.object({
        channel: z.enum(['email', 'push', 'in_app']),
        eventType: z.string().min(1).default('*'),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

const getPrefsQuery = z.object({
  userAddress: z.string().min(1),
});

const createTokenBody = z.object({
  userAddress: z.string().min(1),
  channel: z.enum(['email', 'push', 'in_app']).optional(),
});

/**
 * Notification preference routes (issue #1026).
 * @param {{ notifRepo: ReturnType<import('../dal/sqliteNotificationPreferencesRepository.js').createSqliteNotificationPreferencesRepository> }} opts
 */
export function createNotificationPreferenceRoutes({ notifRepo }) {
  const router = express.Router();

  /**
   * GET /api/v1/notifications/preferences?userAddress=...
   * Return all stored notification preferences for a user.
   */
  router.get('/notifications/preferences', (req, res, next) => {
    try {
      const { userAddress } = getPrefsQuery.parse(req.query);
      const prefs = notifRepo.getPreferences(userAddress);
      const defaults = CHANNELS.map((ch) => ({ channel: ch, eventType: '*', enabled: true }));

      // Merge stored rows onto defaults so callers always get a full picture.
      const merged = defaults.map((def) => {
        const stored = prefs.find(
          (p) => p.channel === def.channel && p.eventType === def.eventType,
        );
        return stored ?? def;
      });

      res.json({ userAddress, preferences: merged });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/v1/notifications/preferences
   * Upsert notification preferences for a user.
   */
  router.put('/notifications/preferences', (req, res, next) => {
    try {
      const { userAddress, preferences } = setPrefsBody.parse(req.body);
      for (const { channel, eventType, enabled } of preferences) {
        notifRepo.setPreference(userAddress, channel, eventType, enabled);
      }
      const updated = notifRepo.getPreferences(userAddress);
      res.json({ userAddress, preferences: updated });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/notifications/unsubscribe-token
   * Generate a one-time unsubscribe link token.
   */
  router.post('/notifications/unsubscribe-token', (req, res, next) => {
    try {
      const { userAddress, channel } = createTokenBody.parse(req.body);
      const token = notifRepo.createUnsubscribeToken(userAddress, channel ?? null);
      res.status(201).json({ token });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/notifications/unsubscribe
   * Honour a one-time unsubscribe token (list-unsubscribe compliance).
   */
  router.post('/notifications/unsubscribe', (req, res, next) => {
    try {
      const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
      const result = notifRepo.applyUnsubscribeToken(token);
      if (!result.ok) {
        return res.status(400).json({ error: 'Invalid or already-used unsubscribe token' });
      }
      res.json({ unsubscribed: true, userAddress: result.userAddress, channel: result.channel });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
