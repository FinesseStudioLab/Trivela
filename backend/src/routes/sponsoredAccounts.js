// #556 — Sponsored account creation + reserve sponsorship (CAP-33 / Stellar sponsored reserves).
//
// Flow for a brand-new address that has zero XLM:
//   1. Client calls POST /api/v1/sponsored-accounts with { address, accountType, trustlineAsset? }
//   2. Backend builds:
//        BeginSponsoringFutureReserves (sponsor signs)
//        CreateAccount OR CreateClaimableBalance (for smart-wallet placeholder)
//        optional: ChangeTrust (trustline for payout asset)
//        EndSponsoringFutureReserves (new account signs)
//   3. Returns the XDR for the client to collect the new account's signature and submit,
//      OR submits directly if the backend holds the sponsor key.
//
// Revoke: POST /api/v1/sponsored-accounts/:address/revoke
//   Builds RevokeSponsorship operation so the account takes over its own reserve.

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  Asset,
  BASE_FEE,
  Horizon,
  StrKey,
} from '@stellar/stellar-sdk';

const GRACE_PERIOD_DAYS = 30;
const DEFAULT_STARTING_BALANCE = '1'; // 1 XLM covers base reserve

/**
 * @param {string | undefined} address
 * @returns {boolean}
 */
function isValidStellarAddress(address) {
  if (!address) return false;
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   dal: import('../dal/index.js').Dal;
 *   stellarConfig: { networkPassphrase: string; horizonUrl: string };
 *   env?: NodeJS.ProcessEnv;
 * }} options
 */
export function createSponsoredAccountRoutes({ dal, stellarConfig, env = process.env }) {
  const router = Router();
  const horizonUrl = stellarConfig.horizonUrl;
  const networkPassphrase = stellarConfig.networkPassphrase;
  const sponsorSecretKey = env.SPONSOR_SECRET_KEY;

  // POST /sponsored-accounts — create a sponsored account
  router.post('/', async (req, res) => {
    const { address, accountType = 'stellar', trustlineAsset } = req.body ?? {};

    if (!isValidStellarAddress(address)) {
      return res.status(400).json({ error: 'address must be a valid Stellar G-address' });
    }
    if (!['stellar', 'smart_wallet'].includes(accountType)) {
      return res.status(400).json({ error: 'accountType must be "stellar" or "smart_wallet"' });
    }
    if (trustlineAsset) {
      const parts = trustlineAsset.split(':');
      if (parts.length !== 2 || !parts[0] || !isValidStellarAddress(parts[1])) {
        return res.status(400).json({
          error: 'trustlineAsset must be "CODE:ISSUER_ADDRESS"',
        });
      }
    }

    // Check for existing sponsorship
    const existing = dal.db
      .prepare("SELECT id FROM sponsored_accounts WHERE address = ? AND status = 'active'")
      .get(address);
    if (existing) {
      return res.status(409).json({ error: 'address already has an active sponsorship' });
    }

    if (!sponsorSecretKey) {
      // Return XDR stub so the client can see what would be built
      const now = new Date().toISOString();
      const id = randomUUID();
      dal.db
        .prepare(
          `INSERT INTO sponsored_accounts
             (id, address, account_type, sponsor_address, status, trustline_asset, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(id, address, accountType, 'SPONSOR_NOT_CONFIGURED', trustlineAsset ?? null, now, now);
      return res.status(202).json({
        id,
        address,
        accountType,
        status: 'active',
        note: 'SPONSOR_SECRET_KEY not configured — sponsorship tracked but no on-chain transaction built',
      });
    }

    try {
      const sponsorKeypair = Keypair.fromSecret(sponsorSecretKey);
      const sponsorAddress = sponsorKeypair.publicKey();
      const server = new Horizon.Server(horizonUrl);
      const sponsorAccount = await server.loadAccount(sponsorAddress);

      const txBuilder = new TransactionBuilder(sponsorAccount, {
        fee: String(Number(BASE_FEE) * 4),
        networkPassphrase,
      });

      // CAP-33: wrap in sponsor envelope
      txBuilder.addOperation(
        Operation.beginSponsoringFutureReserves({ sponsoredId: address }),
      );
      txBuilder.addOperation(
        Operation.createAccount({
          destination: address,
          startingBalance: DEFAULT_STARTING_BALANCE,
        }),
      );
      if (trustlineAsset) {
        const [code, issuer] = trustlineAsset.split(':');
        txBuilder.addOperation(
          Operation.changeTrust({
            asset: new Asset(code, issuer),
            source: address,
          }),
        );
      }
      txBuilder.addOperation(
        Operation.endSponsoringFutureReserves({ source: address }),
      );

      txBuilder.setTimeout(180);
      const tx = txBuilder.build();
      tx.sign(sponsorKeypair);

      // Submit (will fail if the new account hasn't also signed — client must add its sig)
      const xdr = tx.toEnvelope().toXDR('base64');

      const now = new Date().toISOString();
      const id = randomUUID();
      dal.db
        .prepare(
          `INSERT INTO sponsored_accounts
             (id, address, account_type, sponsor_address, status, trustline_asset, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(id, address, accountType, sponsorAddress, trustlineAsset ?? null, now, now);

      return res.status(201).json({
        id,
        address,
        accountType,
        sponsorAddress,
        status: 'active',
        transactionXdr: xdr,
        note: 'Add the new account signature to transactionXdr before submitting to Horizon',
      });
    } catch (err) {
      return res.status(502).json({ error: 'failed to build sponsorship transaction', detail: err.message });
    }
  });

  // GET /sponsored-accounts/:address — lookup sponsorship status
  router.get('/:address', (req, res) => {
    const row = dal.db
      .prepare('SELECT * FROM sponsored_accounts WHERE address = ?')
      .get(req.params.address);
    if (!row) return res.status(404).json({ error: 'not found' });
    return res.json({ sponsorship: row });
  });

  // POST /sponsored-accounts/:address/revoke — transfer reserve back to account
  router.post('/:address/revoke', async (req, res) => {
    const { address } = req.params;
    const row = dal.db
      .prepare("SELECT * FROM sponsored_accounts WHERE address = ? AND status = 'active'")
      .get(address);
    if (!row) return res.status(404).json({ error: 'no active sponsorship for this address' });

    if (!sponsorSecretKey) {
      const now = new Date().toISOString();
      dal.db
        .prepare(
          "UPDATE sponsored_accounts SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(now, now, row.id);
      return res.json({ ok: true, status: 'revoked', note: 'SPONSOR_SECRET_KEY not configured — revocation tracked only' });
    }

    try {
      const sponsorKeypair = Keypair.fromSecret(sponsorSecretKey);
      const server = new Horizon.Server(horizonUrl);
      const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());

      const tx = new TransactionBuilder(sponsorAccount, {
        fee: String(Number(BASE_FEE) * 2),
        networkPassphrase,
      })
        .addOperation(
          Operation.revokeAccountSponsorship({
            account: address,
          }),
        )
        .setTimeout(180)
        .build();

      tx.sign(sponsorKeypair);
      const xdr = tx.toEnvelope().toXDR('base64');

      const now = new Date().toISOString();
      dal.db
        .prepare(
          "UPDATE sponsored_accounts SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(now, now, row.id);

      return res.json({ ok: true, status: 'revoked', transactionXdr: xdr });
    } catch (err) {
      return res.status(502).json({ error: 'failed to build revocation transaction', detail: err.message });
    }
  });

  return router;
}
