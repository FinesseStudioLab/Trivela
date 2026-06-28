// #548 — End-of-campaign job: create claimable balances for eligible-but-unclaimed users.
//
// Two-claimant Stellar predicate (CAP-23):
//   claimant[0] = user,     predicate = before(end + grace)  → user can claim during grace window
//   claimant[1] = operator, predicate = not(before(end + grace)) → operator reclaims after grace

import { randomUUID } from 'node:crypto';
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Claimant,
  BASE_FEE,
  Horizon,
  xdr,
} from '@stellar/stellar-sdk';

const DEFAULT_GRACE_DAYS = 30;

/**
 * Build a Unix timestamp for "now + graceDays days".
 * @param {Date} campaignEnd
 * @param {number} graceDays
 * @returns {Date}
 */
function graceEndDate(campaignEnd, graceDays) {
  const d = new Date(campaignEnd);
  d.setUTCDate(d.getUTCDate() + graceDays);
  return d;
}

/**
 * Find users who were eligible (had credit_events for this campaign) but never claimed.
 * Returns rows: { user, total_credited, total_claimed }
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} campaignId
 * @returns {Array<{ user: string; unclaimed: bigint }>}
 */
export function getUnclaimedUsers(db, campaignId) {
  const hasTables =
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_events'").get() &&
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='claim_events'").get();

  if (!hasTables) return [];

  const rows = db
    .prepare(
      `SELECT
         ce.user,
         COALESCE(SUM(CAST(ce.amount AS INTEGER)), 0) AS total_credited,
         COALESCE(
           (SELECT SUM(CAST(cl.amount AS INTEGER))
            FROM claim_events cl
            WHERE cl.user = ce.user),
           0
         ) AS total_claimed
       FROM credit_events ce
       GROUP BY ce.user
       HAVING total_credited > total_claimed`,
    )
    .all();

  return rows.map((r) => ({
    user: r.user,
    unclaimed: BigInt(r.total_credited) - BigInt(r.total_claimed),
  }));
}

/**
 * @param {{
 *   db: import('better-sqlite3').Database;
 *   campaignId: string;
 *   campaignEndDate: Date;
 *   assetCode?: string;
 *   assetIssuer?: string;
 *   graceDays?: number;
 *   stellarConfig: { networkPassphrase: string; horizonUrl: string };
 *   operatorSecretKey?: string;
 *   logger?: { info: Function; warn: Function; error: Function };
 * }} options
 */
export async function createClaimableBalancesForCampaign({
  db,
  campaignId,
  campaignEndDate,
  assetCode = 'XLM',
  assetIssuer,
  graceDays = DEFAULT_GRACE_DAYS,
  stellarConfig,
  operatorSecretKey,
  logger = console,
}) {
  const unclaimedUsers = getUnclaimedUsers(db, campaignId);
  if (unclaimedUsers.length === 0) {
    logger.info?.(`[claimableBalances] campaign=${campaignId} no unclaimed users`);
    return { created: 0, skipped: 0 };
  }

  const graceEnd = graceEndDate(campaignEndDate, graceDays);
  const graceEndIso = graceEnd.toISOString();

  let created = 0;
  let skipped = 0;

  for (const { user, unclaimed } of unclaimedUsers) {
    // Idempotency: skip if a balance row already exists for this user+campaign
    const existing = db
      .prepare(
        "SELECT id FROM claimable_balances WHERE campaign_id = ? AND user_address = ? AND status != 'failed'",
      )
      .get(campaignId, user);
    if (existing) { skipped++; continue; }

    const now = new Date().toISOString();
    const id = randomUUID();
    const amountStr = (Number(unclaimed) / 1e7).toFixed(7); // stroops → display amount

    // Insert as pending first
    db.prepare(
      `INSERT INTO claimable_balances
         (id, campaign_id, user_address, asset_code, asset_issuer, amount, status, grace_end_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(id, campaignId, user, assetCode, assetIssuer ?? null, amountStr, graceEndIso, now, now);

    if (!operatorSecretKey) {
      logger.warn?.(`[claimableBalances] OPERATOR_SECRET_KEY not set — row ${id} left as pending`);
      skipped++;
      continue;
    }

    try {
      const operatorKeypair = Keypair.fromSecret(operatorSecretKey);
      const server = new Horizon.Server(stellarConfig.horizonUrl);
      const account = await server.loadAccount(operatorKeypair.publicKey());

      const asset = assetIssuer
        ? new Asset(assetCode, assetIssuer)
        : Asset.native();

      const graceEndUnix = Math.floor(graceEnd.getTime() / 1000);

      // user: unconditional until grace end
      const userPredicate = Claimant.predicateBeforeAbsoluteTime(String(graceEndUnix));
      // operator: after grace end (not-before)
      const operatorPredicate = Claimant.predicateNot(
        Claimant.predicateBeforeAbsoluteTime(String(graceEndUnix)),
      );

      const tx = new TransactionBuilder(account, {
        fee: String(Number(BASE_FEE) * 2),
        networkPassphrase: stellarConfig.networkPassphrase,
      })
        .addOperation(
          Operation.createClaimableBalance({
            asset,
            amount: amountStr,
            claimants: [
              new Claimant(user, userPredicate),
              new Claimant(operatorKeypair.publicKey(), operatorPredicate),
            ],
          }),
        )
        .setTimeout(180)
        .build();

      tx.sign(operatorKeypair);
      const result = await server.submitTransaction(tx);

      // Extract the balance_id from the transaction result
      const balanceId = result.id ?? null;
      db.prepare(
        "UPDATE claimable_balances SET status = 'created', balance_id = ?, updated_at = ? WHERE id = ?",
      ).run(balanceId, new Date().toISOString(), id);
      created++;
    } catch (err) {
      logger.error?.(`[claimableBalances] failed for user=${user}: ${err.message}`);
      db.prepare(
        "UPDATE claimable_balances SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
      ).run(err.message.slice(0, 500), new Date().toISOString(), id);
      skipped++;
    }
  }

  logger.info?.(`[claimableBalances] campaign=${campaignId} created=${created} skipped=${skipped}`);
  return { created, skipped };
}
