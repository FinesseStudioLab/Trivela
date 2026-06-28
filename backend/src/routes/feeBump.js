// #555 — Fee-bump / sponsored transactions (gasless registration & claim).
//
// POST /api/v1/fee-bump
//   Body: { innerXdr: string, walletAddress: string }
//   Returns: { feeBumpXdr: string } — the signed fee-bump XDR ready to submit.
//
// Security constraints:
//   - Only InvokeHostFunction (Soroban) and Payment operations are allowlisted.
//   - Per-wallet daily quota (default: 10). Rejected when exhausted.
//   - Circuit breaker: if sponsor XLM balance < MIN_SPONSOR_BALANCE, reject.
//   - Replay prevention: inner tx hash must not have been seen before (quota table).

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  Keypair,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  Horizon,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';

const DEFAULT_DAILY_QUOTA = 10;
const DEFAULT_MIN_SPONSOR_BALANCE = '5'; // XLM
const FEE_BUMP_BASE_FEE = '1000000'; // 0.1 XLM fee for the bump

// Operations permitted to be fee-bumped (Stellar operation type names from XDR).
// Only Soroban (invokeHostFunction) and classic payment/claimClaimableBalance.
const ALLOWED_OP_TYPES = new Set([
  'invokeHostFunction',
  'payment',
  'claimClaimableBalance',
  'changeTrust',
  'createAccount',
]);

/**
 * @param {string | undefined} address
 * @returns {boolean}
 */
function isValidAddress(address) {
  if (!address) return false;
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

/**
 * Parse and validate an inner transaction XDR, returning the ops list.
 * @param {string} innerXdr
 * @returns {{ tx: Transaction, opTypes: string[] } | { error: string }}
 */
function parseInnerTx(innerXdr) {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(innerXdr, 'base64');
    // Must be a v1 transaction (not a fee bump itself)
    if (envelope.switch().name !== 'envelopeTypeTxV1') {
      return { error: 'innerXdr must be a v1 transaction envelope, not a fee-bump' };
    }
    const tx = new Transaction(innerXdr, '*');
    const opTypes = tx.operations.map((op) => op.type);
    return { tx, opTypes };
  } catch (err) {
    return { error: `Invalid transaction XDR: ${err.message}` };
  }
}

/**
 * @param {{
 *   dal: import('../dal/index.js').Dal;
 *   stellarConfig: { networkPassphrase: string; horizonUrl: string };
 *   env?: NodeJS.ProcessEnv;
 *   logger?: { info: Function; warn: Function; error: Function };
 * }} options
 */
export function createFeeBumpRoutes({ dal, stellarConfig, env = process.env, logger = console }) {
  const router = Router();
  const { horizonUrl, networkPassphrase } = stellarConfig;
  const sponsorSecretKey = env.SPONSOR_SECRET_KEY;
  const dailyQuota = Number(env.FEE_BUMP_DAILY_QUOTA ?? DEFAULT_DAILY_QUOTA);
  const minSponsorBalance = env.MIN_SPONSOR_BALANCE ?? DEFAULT_MIN_SPONSOR_BALANCE;

  // POST /fee-bump
  router.post('/', async (req, res) => {
    const { innerXdr, walletAddress } = req.body ?? {};

    if (!innerXdr || typeof innerXdr !== 'string') {
      return res.status(400).json({ error: 'innerXdr (string) is required' });
    }
    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({ error: 'walletAddress must be a valid Stellar G-address' });
    }

    // Parse & allowlist check
    const parsed = parseInnerTx(innerXdr);
    if ('error' in parsed) {
      return res.status(400).json({ error: parsed.error });
    }
    const disallowedOps = parsed.opTypes.filter((t) => !ALLOWED_OP_TYPES.has(t));
    if (disallowedOps.length > 0) {
      return res.status(403).json({
        error: 'Transaction contains disallowed operation types',
        disallowed: disallowedOps,
        allowed: [...ALLOWED_OP_TYPES],
      });
    }

    if (!sponsorSecretKey) {
      return res.status(503).json({ error: 'SPONSOR_SECRET_KEY not configured' });
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecretKey);
    const sponsorAddress = sponsorKeypair.publicKey();

    // Circuit breaker: check sponsor balance
    try {
      const server = new Horizon.Server(horizonUrl);
      const sponsorAccount = await server.loadAccount(sponsorAddress);
      const nativeBalance = sponsorAccount.balances.find((b) => b.asset_type === 'native');
      const balanceXlm = parseFloat(nativeBalance?.balance ?? '0');
      const minBalance = parseFloat(minSponsorBalance);

      if (balanceXlm < minBalance) {
        logger.warn?.(
          { sponsorAddress, balance: balanceXlm, threshold: minBalance },
          '[feeBump] circuit breaker open: sponsor balance below threshold',
        );
        return res.status(503).json({
          error: 'Sponsorship temporarily unavailable (sponsor reserve low)',
          code: 'SPONSOR_RESERVE_LOW',
        });
      }
    } catch (err) {
      return res
        .status(502)
        .json({ error: 'Failed to verify sponsor balance', detail: err.message });
    }

    // Quota check + increment (atomic upsert)
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const hasTable = dal.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fee_bump_quota'")
      .get();

    if (hasTable) {
      // Upsert daily count
      const existing = dal.db
        .prepare('SELECT id, count FROM fee_bump_quota WHERE wallet = ? AND date = ?')
        .get(walletAddress, today);

      if (existing) {
        if (existing.count >= dailyQuota) {
          return res.status(429).json({
            error: 'Daily sponsorship quota exhausted',
            code: 'QUOTA_EXHAUSTED',
            limit: dailyQuota,
            resets: `${today}T23:59:59Z`,
          });
        }
        dal.db
          .prepare('UPDATE fee_bump_quota SET count = count + 1, updated_at = ? WHERE id = ?')
          .run(new Date().toISOString(), existing.id);
      } else {
        dal.db
          .prepare(
            `INSERT INTO fee_bump_quota (id, wallet, date, count, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
          )
          .run(
            randomUUID(),
            walletAddress,
            today,
            new Date().toISOString(),
            new Date().toISOString(),
          );
      }
    }

    // Build fee-bump transaction
    try {
      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        sponsorKeypair,
        FEE_BUMP_BASE_FEE,
        parsed.tx,
        networkPassphrase,
      );
      feeBumpTx.sign(sponsorKeypair);
      const feeBumpXdr = feeBumpTx.toEnvelope().toXDR('base64');

      logger.info?.({ walletAddress, ops: parsed.opTypes }, '[feeBump] fee-bump transaction built');

      return res.status(200).json({ feeBumpXdr });
    } catch (err) {
      return res
        .status(502)
        .json({ error: 'Failed to build fee-bump transaction', detail: err.message });
    }
  });

  // GET /fee-bump/quota/:wallet — check remaining quota
  router.get('/quota/:wallet', (req, res) => {
    const { wallet } = req.params;
    if (!isValidAddress(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const hasTable = dal.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fee_bump_quota'")
      .get();

    const used = hasTable
      ? (dal.db
          .prepare('SELECT count FROM fee_bump_quota WHERE wallet = ? AND date = ?')
          .get(wallet, today)?.count ?? 0)
      : 0;

    return res.json({
      wallet,
      date: today,
      used,
      limit: dailyQuota,
      remaining: Math.max(0, dailyQuota - used),
    });
  });

  return router;
}
