// @ts-check
import { buildCampaignStatsForRange } from '../services/campaignStatsService.js';
import { sendEmail } from '../services/emailService.js';

/**
 * Weekly campaign performance email digest for operators (#1355).
 *
 * Collects participation analytics for the trailing 7 days across all
 * campaigns and emails a summary to every configured recipient. Idempotent
 * per ISO week: a checkpoint row prevents duplicate sends within the same
 * week when the job is retried or the server restarts.
 *
 * @param {Object} params
 * @param {InstanceType<import('better-sqlite3')>} params.db
 * @param {{ send: Function }} [params.emailService]
 * @param {ReturnType<import('../dal/sqliteCampaignRepository.js').createSqliteCampaignRepository>} [params.campaignRepository]
 * @param {ReturnType<import('../dal/sqliteReferralRepository.js').createSqliteReferralRepository>} [params.referralRepository]
 * @param {() => string[]} [params.getRecipients]
 * @param {Object} [params.logger]
 */
export function createWeeklyDigestJob({
  db,
  emailService,
  campaignRepository,
  referralRepository,
  getRecipients,
  logger = console,
}) {
  const checkpointTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'export_checkpoints'")
    .get();

  if (checkpointTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS digest_checkpoints (
        week_key     TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS digest_checkpoints (
        week_key     TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL
      );
    `);
  }

  const checkpointSelect = db.prepare('SELECT week_key FROM digest_checkpoints WHERE week_key = ?');
  const checkpointInsert = db.prepare(
    'INSERT OR IGNORE INTO digest_checkpoints (week_key, completed_at) VALUES (?, ?)',
  );

  /**
   * ISO week key, e.g. "2024-W03".
   * @param {Date} date
   */
  function weekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * Build the digest body for the trailing week.
   * @returns {{ subject: string, text: string, campaignCount: number }}
   */
  function buildDigest() {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 7);

    const campaigns =
      campaignRepository?.list({ active: true, includeHidden: false, status: 'all' }) ?? [];

    const lines = [
      'Weekly campaign performance digest',
      `Period: ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`,
      '',
    ];

    if (campaigns.length === 0) {
      lines.push('No active campaigns this week.');
    }

    for (const campaign of campaigns) {
      const stats = buildCampaignStatsForRange({
        db,
        campaign,
        referralRepository,
        indexerCursor: null,
        from,
        to,
      });
      const { totalParticipants, totalPoints, claimRate } = stats.summary;
      lines.push(
        `• ${campaign.name}: ${totalParticipants} participants, ` +
          `${totalPoints} points, ${claimRate}% claim rate`,
      );
    }

    return {
      subject: `Trivela weekly digest — ${weekKey(to)}`,
      text: lines.join('\n'),
      campaignCount: campaigns.length,
    };
  }

  return {
    /**
     * Run the weekly digest. Skips when the current ISO week is already
     * checkpointed or no recipients are configured.
     *
     * @returns {Promise<{ skipped: boolean, reason?: string, sent: number }>}
     */
    async run() {
      const now = new Date();
      const wk = weekKey(now);

      if (checkpointSelect.get(wk)) {
        return { skipped: true, reason: 'already_sent', sent: 0 };
      }

      const recipients = (getRecipients?.() ?? []).filter(Boolean);
      if (recipients.length === 0) {
        return { skipped: true, reason: 'no_recipients', sent: 0 };
      }

      const digest = buildDigest();
      let sent = 0;
      for (const to of recipients) {
        try {
          if (emailService?.send) {
            await emailService.send({ to, subject: digest.subject, text: digest.text });
          } else {
            await sendEmail('operator-digest-v1', to, {
              name: to.split('@')[0],
              totalParticipants: digest.campaignCount,
              totalClaims: 0,
              topCampaign: digest.text.split('\n')[3] ?? 'N/A',
              periodLabel: digest.subject,
            });
          }
          sent += 1;
        } catch {
          // skip failed recipients
        }
      }

      checkpointInsert.run(wk, now.toISOString());
      logger.info?.(
        `digest:weekly week=${wk} campaigns=${digest.campaignCount} recipients=${recipients.length} sent=${sent}`,
      );
      return { skipped: false, sent };
    },

    weekKey,
    buildDigest,
  };
}
