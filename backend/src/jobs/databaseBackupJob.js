/**
 * Daily Database Backup Job
 * Runs daily to create and maintain database backups
 */

import { log } from '../middleware/logger.js';
import { DatabaseBackupService } from '../services/databaseBackupService.js';

/**
 * @param {{ db: any }} options
 */
export async function runDatabaseBackupJob(options) {
  const { db } = options;

  const backupService = new DatabaseBackupService({
    db,
    backupDir: process.env.BACKUP_DIR ?? './backups',
  });

  try {
    await backupService.initialize();

    const backup = await backupService.createBackup('daily');
    const backups = await backupService.listBackups();

    log.info({
      backup,
      totalBackups: backups.length,
    }, 'backup:job:completed');

    return {
      success: true,
      backup,
      totalBackups: backups.length,
    };
  } catch (error) {
    log.error({ error: error.message }, 'backup:job:failed');
    throw error;
  }
}

export const metadata = {
  name: 'database-backup',
  schedule: '0 2 * * *', // 2 AM daily
  description: 'Creates daily database backups with automatic rotation',
  retry: {
    maxAttempts: 3,
    backoffMs: 5000,
  },
};
