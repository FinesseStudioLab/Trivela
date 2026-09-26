// @ts-check
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * GitHub webhook verification for developer-bounty campaigns (#1256).
 *
 * A reward task is only considered verified when GitHub itself says so: a pull
 * request `closed` with `merged: true`, or an issue `closed` as completed. The
 * payload is authenticated with the shared secret (`X-Hub-Signature-256`) and
 * every delivery is recorded once, so redeliveries are harmless.
 */

/**
 * Constant-time check of GitHub's `sha256=<hex>` signature over the raw body.
 *
 * @param {Buffer | string} rawBody
 * @param {string | undefined} signatureHeader
 * @param {string} secret
 */
export function verifyGithubSignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Turn a GitHub webhook payload into a verified task, or null when the event is
 * not one that proves a task was completed.
 *
 * @param {string} event the `X-GitHub-Event` header
 * @param {Record<string, any>} payload
 * @returns {{ kind: 'pr_merged' | 'issue_closed', repo: string, number: number,
 *   githubLogin: string, url: string | null, title: string | null,
 *   occurredAt: string | null } | null}
 */
export function extractVerifiedTask(event, payload) {
  const repo = payload?.repository?.full_name;
  if (typeof repo !== 'string' || !repo) return null;

  if (event === 'pull_request') {
    const pr = payload.pull_request;
    // A PR that was closed without merging is not a completed task.
    if (payload.action !== 'closed' || pr?.merged !== true) return null;
    const login = pr.user?.login;
    if (!login) return null;
    return {
      kind: 'pr_merged',
      repo,
      number: Number(pr.number),
      githubLogin: String(login),
      url: pr.html_url ?? null,
      title: pr.title ?? null,
      occurredAt: pr.merged_at ?? null,
    };
  }

  if (event === 'issues') {
    const issue = payload.issue;
    // `not_planned` closures are not completed work.
    if (payload.action !== 'closed' || issue?.state_reason === 'not_planned') return null;
    const login = payload.sender?.login;
    if (!login) return null;
    return {
      kind: 'issue_closed',
      repo,
      number: Number(issue.number),
      githubLogin: String(login),
      url: issue.html_url ?? null,
      title: issue.title ?? null,
      occurredAt: issue.closed_at ?? null,
    };
  }

  return null;
}

/**
 * @param {{ db: InstanceType<import('better-sqlite3')>, logger?: { info?: Function } }} options
 */
export function createGithubTaskStore({ db, logger = console }) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO github_task_events
      (delivery_id, kind, repo, number, github_login, url, title, occurred_at, recorded_at)
    VALUES (@deliveryId, @kind, @repo, @number, @githubLogin, @url, @title, @occurredAt, @recordedAt)
  `);

  return {
    /**
     * @param {string} deliveryId
     * @param {NonNullable<ReturnType<typeof extractVerifiedTask>>} task
     * @returns {boolean} true when newly recorded, false for a redelivery/duplicate
     */
    record(deliveryId, task) {
      const result = insert.run({ deliveryId, ...task, recordedAt: new Date().toISOString() });
      if (result.changes > 0) {
        logger.info?.(
          { repo: task.repo, kind: task.kind, number: task.number },
          'github:task_verified',
        );
      }
      return result.changes > 0;
    },

    /**
     * Has this GitHub user completed the given task? Login match is case-insensitive.
     * @param {{ kind?: string, repo?: string, number?: number, githubLogin: string }} query
     */
    isVerified({ kind, repo, number, githubLogin }) {
      const where = ['github_login = ? COLLATE NOCASE'];
      const params = [githubLogin];
      if (kind) (where.push('kind = ?'), params.push(kind));
      if (repo) (where.push('repo = ? COLLATE NOCASE'), params.push(repo));
      if (number !== undefined) (where.push('number = ?'), params.push(number));
      return Boolean(
        db
          .prepare(`SELECT 1 FROM github_task_events WHERE ${where.join(' AND ')} LIMIT 1`)
          .get(...params),
      );
    },

    /** @param {{ githubLogin?: string, repo?: string, limit?: number }} [filter] */
    list({ githubLogin, repo, limit = 50 } = {}) {
      const where = [];
      const params = [];
      if (githubLogin) (where.push('github_login = ? COLLATE NOCASE'), params.push(githubLogin));
      if (repo) (where.push('repo = ? COLLATE NOCASE'), params.push(repo));
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      return db
        .prepare(`SELECT * FROM github_task_events ${clause} ORDER BY id DESC LIMIT ?`)
        .all(...params, Math.min(Math.max(limit, 1), 200))
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          repo: r.repo,
          number: r.number,
          githubLogin: r.github_login,
          url: r.url,
          title: r.title,
          occurredAt: r.occurred_at,
          recordedAt: r.recorded_at,
        }));
    },
  };
}
