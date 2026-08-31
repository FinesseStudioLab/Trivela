/**
 * ZK proving inputs endpoint.
 *
 * Serves the public inputs needed for client-side ZK proof generation.
 * Never accepts or returns the user's secret — secrets stay on the device.
 *
 * Endpoint:
 *   GET /api/v1/campaigns/:id/zk-inputs?commitment=...
 */

import { Router } from 'express';

const COMMITMENT_REGEX = /^[a-fA-F0-9]{64}$/;

/**
 * Create the ZK inputs router.
 *
 * @param {{
 *   campaignRepository: { getById: (id: string) => { id: string, [key: string]: unknown } | null },
 *   dal: { [key: string]: unknown },
 * }} options
 */
export function createZkInputsRoutes({ campaignRepository }) {
  const router = Router();

  router.get('/campaigns/:id/zk-inputs', (req, res) => {
    const { id } = req.params;
    const commitment = String(req.query.commitment || '').trim();

    if (!commitment || !COMMITMENT_REGEX.test(commitment)) {
      return res.status(400).json({
        error: 'Invalid commitment hash (must be 64 hex characters)',
        code: 'INVALID_COMMITMENT',
      });
    }

    const campaign = campaignRepository.getById(id);
    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found',
        code: 'CAMPAIGN_NOT_FOUND',
      });
    }

    // Fetch the Merkle root from on-chain state or campaign config
    const merkleRoot = campaign.merkleRoot || null;

    if (!merkleRoot) {
      return res.status(400).json({
        error: 'Campaign does not have a Merkle root configured for ZK registration',
        code: 'NO_MERKLE_ROOT',
      });
    }

    // In production, the Merkle path would be fetched from a Merkle tree
    // service or computed from the allowlist. For now, return a placeholder
    // structure that the frontend can consume.
    const merklePath = campaign.merklePaths?.[commitment] || [];

    return res.json({
      campaign_id: id,
      merkle_root: merkleRoot,
      commitment,
      merkle_path: merklePath,
      circuit_metadata: {
        name: 'trivela_registration_v1',
        version: '0.1.0',
        public_signals: ['merkle_root', 'nullifier', 'commitment'],
      },
    });
  });

  return router;
}
