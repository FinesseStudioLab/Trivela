import express from 'express';

export function createNotificationRoutes({ dal }) {
  const router = express.Router();

  router.get('/notifications', (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const notifications = dal.notifications.listByUserId({ userId, limit, offset });
      const unreadCount = dal.notifications.getUnreadCount(userId);

      res.json({
        data: notifications,
        unreadCount,
        limit,
        offset,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/notifications/:id/read', (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      dal.notifications.markAsRead(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/notifications/mark-all-read', (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      dal.notifications.markAllAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export function createNotificationPreferencesRoutes({ dal }) {
  const router = express.Router();

  router.get('/notification-preferences', (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const prefs = dal.notificationPreferences.getOrCreate(userId);
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/notification-preferences', (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { emailEnabled, smsEnabled, whatsappEnabled, phoneNumber } = req.body;

      dal.notificationPreferences.getOrCreate(userId);
      dal.notificationPreferences.update({
        userId,
        emailEnabled,
        smsEnabled,
        whatsappEnabled,
        phoneNumber,
      });

      const updated = dal.notificationPreferences.get(userId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
