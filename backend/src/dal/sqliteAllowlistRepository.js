// @ts-check
import { bytesToHex } from '../lib/allowlist/merkle.js';

export function createSqliteAllowlistRepository({ db }) {
  function upsertAllowlistEntries({ campaignId, addressEntries, merkleRootHex }) {
    const tx = db.transaction(() => {
      // Replace existing allowlist for campaign
      db.prepare('DELETE FROM allowlists WHERE campaign_id = ?').run(campaignId);

      const stmt = db.prepare(
        `INSERT INTO allowlists (campaign_id, address, merkle_proof, merkle_root, label, bonus_points, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const now = new Date().toISOString();
      for (const entry of addressEntries) {
        stmt.run(
          campaignId,
          entry.address,
          JSON.stringify(entry.proof),
          merkleRootHex,
          entry.label ?? null,
          entry.bonus_points ?? null,
          now,
          now,
        );
      }
    });

    tx();
  }

  function listAllowlist(campaignId) {
    return db
      .prepare(
        `SELECT address, label, bonus_points, merkle_proof, merkle_root, created_at, updated_at
         FROM allowlists
         WHERE campaign_id = ?
         ORDER BY address ASC`,
      )
      .all(campaignId)
      .map((row) => ({
        address: row.address,
        label: row.label,
        bonus_points: row.bonus_points,
        merkleRoot: row.merkle_root,
        merkleProof: row.merkle_proof ? JSON.parse(row.merkle_proof) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  function getProof(campaignId, address) {
    return db
      .prepare(
        `SELECT merkle_proof, merkle_root FROM allowlists
         WHERE campaign_id = ? AND address = ?`,
      )
      .get(campaignId, address);
  }

  function getMerkeRoot(campaignId) {
    const row = db
      .prepare('SELECT merkle_root FROM allowlists WHERE campaign_id = ? LIMIT 1')
      .get(campaignId);
    return row?.merkle_root ?? null;
  }

  return {
    upsertAllowlistEntries,
    listAllowlist,
    getProof,
    getMerkeRoot,
  };
}
