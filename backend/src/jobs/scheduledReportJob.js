// @ts-check

/**
 * Scheduled digest email job.
 *
 * Sends a periodic analytics / campaign-summary report to opted-in users.
 * The schedule (cron expression or interval) is configured externally via the
 * job runner — this module only contains the per-run logic.
 *
 * Opt-out is honoured via the `notification_preferences.email_enabled` flag.
 * When `email_enabled = 0`, the user is silently skipped.
 *
 * @param {{
 *   dal: {
 *     notificationPreferences: {
 *       getByUserId: (userId: string) => { email_enabled: 0 | 1 } | null
 *     },
 *     reportSubscriptions?: {
 *       listActive: () => Array<{ userId: string, email: string, reportType: string, schedule: string }>
 *     },
 *     campaignStats?: {
 *       summaryForUser: (userId: string, range: string) => object
 *     }
 *   },
 *   mailer: {
 *     send: (opts: { to: string, subject: string, html: string, text?: string }) => Promise<void>
 *   },
 *   reportSchedule?: string,
 *   logger?: Pick<Console, 'info' | 'warn' | 'error'>
 * }} deps
 */
export function createScheduledReportJob({
  dal,
  mailer,
  reportSchedule = 'weekly',
  logger = console,
}) {
  /**
   * Run the scheduled digest report.
   * Fetches all active subscriptions, respects opt-outs, sends emails.
   *
   * @param {{ now?: Date }} [opts]
   */
  async function run({ now = new Date() } = {}) {
    const rangeLabel = reportSchedule === 'daily' ? 'last 24 hours' : 'last 7 days';
    logger.info?.(`scheduledReport:start schedule=${reportSchedule} rangeLabel="${rangeLabel}"`);

    const subscriptions = dal.reportSubscriptions?.listActive?.() ?? [];
    if (subscriptions.length === 0) {
      logger.info?.('scheduledReport:skip reason=no_active_subscriptions');
      return { sent: 0, skipped: 0 };
    }

    let sent = 0;
    let skipped = 0;

    for (const sub of subscriptions) {
      // Honour the per-user opt-out preference
      const prefs = dal.notificationPreferences.getByUserId(sub.userId);
      if (prefs && prefs.email_enabled === 0) {
        logger.info?.(`scheduledReport:skip userId=${sub.userId} reason=opted_out`);
        skipped++;
        continue;
      }

      // Skip if this subscription's schedule doesn't match the current run
      if (sub.schedule && sub.schedule !== reportSchedule) {
        skipped++;
        continue;
      }

      let stats = null;
      try {
        stats = dal.campaignStats?.summaryForUser?.(sub.userId, rangeLabel) ?? null;
      } catch (err) {
        logger.warn?.(`scheduledReport:stats_error userId=${sub.userId}`, err);
      }

      const { html, text } = buildReportEmail({ sub, stats, rangeLabel, now });

      try {
        await mailer.send({
          to: sub.email,
          subject: `Trivela ${reportSchedule} report — ${formatDate(now)}`,
          html,
          text,
        });
        sent++;
        logger.info?.(`scheduledReport:sent userId=${sub.userId} email=${sub.email}`);
      } catch (err) {
        logger.error?.(`scheduledReport:send_failed userId=${sub.userId} email=${sub.email}`, err);
        // Continue to next subscriber — partial failure is acceptable
      }
    }

    logger.info?.(`scheduledReport:done sent=${sent} skipped=${skipped}`);
    return { sent, skipped };
  }

  return { run };
}

/**
 * Build the HTML + text body for a report email.
 *
 * @param {{
 *   sub: { userId: string, email: string, reportType: string },
 *   stats: object | null,
 *   rangeLabel: string,
 *   now: Date
 * }} opts
 */
function buildReportEmail({ sub, stats, rangeLabel, now }) {
  const dateStr = formatDate(now);
  const statsSection = stats
    ? `<pre>${JSON.stringify(stats, null, 2)}</pre>`
    : '<p>No campaign data available for this period.</p>';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Trivela Report</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="color:#1a1a2e">Trivela Report — ${dateStr}</h1>
  <p>Here is your <strong>${rangeLabel}</strong> summary.</p>
  ${statsSection}
  <hr>
  <p style="color:#888;font-size:12px">
    To stop receiving these emails, update your notification preferences in the Trivela dashboard.
  </p>
</body>
</html>`;

  const text = [
    `Trivela Report — ${dateStr}`,
    `Period: ${rangeLabel}`,
    '',
    stats ? JSON.stringify(stats, null, 2) : 'No campaign data available for this period.',
    '',
    'To unsubscribe, update your notification preferences in the Trivela dashboard.',
  ].join('\n');

  return { html, text };
}

/** @param {Date} d */
function formatDate(d) {
  return d.toISOString().slice(0, 10);
}
