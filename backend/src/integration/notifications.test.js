import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteNotificationRepository } from '../dal/sqliteNotificationRepository.js';
import { createSqliteNotificationPreferencesRepository } from '../dal/sqliteNotificationPreferencesRepository.js';

describe('Notifications', () => {
  let db;
  let notificationRepo;
  let preferencesRepo;

  beforeEach(async () => {
    db = new Database(':memory:');
    await runMigrations(db);
    notificationRepo = createSqliteNotificationRepository({ db });
    preferencesRepo = createSqliteNotificationPreferencesRepository({ db });
  });

  describe('Notifications Repository', () => {
    it('should create a notification', () => {
      const result = notificationRepo.create({
        userId: 'user-1',
        campaignId: 1,
        title: 'Test Notification',
        message: 'This is a test',
        type: 'reward',
      });

      assert.notEqual(result.id, undefined);
    });

    it('should list notifications for a user', () => {
      notificationRepo.create({
        userId: 'user-1',
        campaignId: 1,
        title: 'Test 1',
        message: 'Message 1',
      });
      notificationRepo.create({
        userId: 'user-1',
        campaignId: 2,
        title: 'Test 2',
        message: 'Message 2',
      });

      const notifications = notificationRepo.listByUserId({ userId: 'user-1' });
      assert.equal(notifications.length, 2);
    });

    it('should get unread count', () => {
      notificationRepo.create({
        userId: 'user-1',
        campaignId: 1,
        title: 'Test 1',
        message: 'Message 1',
      });
      notificationRepo.create({
        userId: 'user-1',
        campaignId: 2,
        title: 'Test 2',
        message: 'Message 2',
      });

      const count = notificationRepo.getUnreadCount('user-1');
      assert.equal(count, 2);
    });

    it('should mark notification as read', () => {
      const { id } = notificationRepo.create({
        userId: 'user-1',
        campaignId: 1,
        title: 'Test',
        message: 'Message',
      });

      notificationRepo.markAsRead(id);

      const count = notificationRepo.getUnreadCount('user-1');
      assert.equal(count, 0);
    });

    it('should mark all notifications as read', () => {
      notificationRepo.create({
        userId: 'user-1',
        campaignId: 1,
        title: 'Test 1',
        message: 'Message 1',
      });
      notificationRepo.create({
        userId: 'user-1',
        campaignId: 2,
        title: 'Test 2',
        message: 'Message 2',
      });

      notificationRepo.markAllAsRead('user-1');

      const count = notificationRepo.getUnreadCount('user-1');
      assert.equal(count, 0);
    });
  });

  describe('Notification Preferences Repository', () => {
    it('should create or get user preferences', () => {
      const prefs = preferencesRepo.getOrCreate('user-1');
      assert.notEqual(prefs, undefined);
      assert.equal(prefs.user_id, 'user-1');
      assert.equal(prefs.email_enabled, 1);
      assert.equal(prefs.sms_enabled, 0);
    });

    it('should update preferences', () => {
      preferencesRepo.getOrCreate('user-1');
      preferencesRepo.update({
        userId: 'user-1',
        emailEnabled: 0,
        smsEnabled: 1,
        whatsappEnabled: 1,
        phoneNumber: '+1234567890',
      });

      const prefs = preferencesRepo.get('user-1');
      assert.equal(prefs.email_enabled, 0);
      assert.equal(prefs.sms_enabled, 1);
      assert.equal(prefs.whatsapp_enabled, 1);
      assert.equal(prefs.phone_number, '+1234567890');
    });
  });
});
