import { log } from '../middleware/logger.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Automated Daily Database Backup and Point-in-Time Recovery Service
 * Manages database backups with rotation and recovery capabilities
 */

class DatabaseBackupService {
  constructor({ db, backupDir = './backups' }) {
    this.db = db;
    this.backupDir = backupDir;
    this.maxBackups = 30; // Keep 30 days of backups
  }

  async initialize() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      log.info({ backupDir: this.backupDir }, 'backup:initialized');
    } catch (error) {
      log.error({ error: error.message }, 'backup:init:failed');
      throw error;
    }
  }

  async createBackup(label = 'daily') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${label}-${timestamp}.db`;
    const filepath = join(this.backupDir, filename);

    try {
      // Use SQLite backup API
      const backup = this.db.backup(filepath);
      await backup.all();

      log.info({ filepath, label }, 'backup:created:success');

      // Clean old backups
      await this.rotateBackups();

      return {
        filename,
        filepath,
        timestamp,
        label,
      };
    } catch (error) {
      log.error({ filepath, error: error.message }, 'backup:created:failed');
      throw error;
    }
  }

  async rotateBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse();

      const toDelete = backupFiles.slice(this.maxBackups);

      for (const file of toDelete) {
        await fs.unlink(join(this.backupDir, file));
        log.debug({ file }, 'backup:rotated:deleted');
      }
    } catch (error) {
      log.warn({ error: error.message }, 'backup:rotate:failed');
    }
  }

  async restoreFromBackup(filepath) {
    try {
      // Verify backup exists
      await fs.stat(filepath);

      // Create recovery backup first
      const recoveryLabel = `recovery-${Date.now()}`;
      await this.createBackup(recoveryLabel);

      // Restore from backup
      const sourceDb = new (await import('better-sqlite3')).default(filepath);
      const tables = sourceDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all();

      for (const table of tables) {
        const data = sourceDb.prepare(`SELECT * FROM "${table.name}"`).all();
        this.db.prepare(`DELETE FROM "${table.name}"`).run();

        if (data.length > 0) {
          const columns = Object.keys(data[0]).join(', ');
          const placeholders = Object.keys(data[0]).map(() => '?').join(', ');
          const stmt = this.db.prepare(
            `INSERT INTO "${table.name}" (${columns}) VALUES (${placeholders})`
          );

          for (const row of data) {
            stmt.run(...Object.values(row));
          }
        }
      }

      sourceDb.close();
      log.info({ filepath }, 'backup:restored:success');

      return { success: true, filepath };
    } catch (error) {
      log.error({ filepath, error: error.message }, 'backup:restored:failed');
      throw error;
    }
  }

  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = await Promise.all(
        files
          .filter(f => f.startsWith('backup-'))
          .map(async (file) => {
            const stats = await fs.stat(join(this.backupDir, file));
            return {
              filename: file,
              size: stats.size,
              created: stats.mtime,
            };
          })
      );

      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      log.warn({ error: error.message }, 'backup:list:failed');
      return [];
    }
  }
}

export { DatabaseBackupService };
