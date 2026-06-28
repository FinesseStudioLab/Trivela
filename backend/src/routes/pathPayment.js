// #549 — Path payment support for multi-asset claims.
//
// GET  /api/v1/payment-paths
//   Query: source_account, destination_asset (CODE:ISSUER or "native"),
//          destination_amount, source_asset? (default: native)
//   Proxies Horizon /paths/strict-receive and returns viable paths.
//
// POST /api/v1/payment-paths/claim
//   Body: { walletAddress, destinationAsset, destinationAmount,
//           sendAsset?, path?, maxSendAmount, slippageBps? }
//   Builds a PathPaymentStrictReceive transaction signed by the caller's wallet.
//   Returns XDR for the frontend to sign + submit, with slippage guard applied.

import { Router } from 'express';
import { Asset, StrKey } from '@stellar/stellar-sdk';

const DEFAULT_SLIPPAGE_BPS = 100; // 1%
const MAX_SLIPPAGE_BPS = 500; // 5% hard cap

/**
 * Parse a Horizon asset code string like "USDC:GA..." or "native".
 * @param {string} raw
 * @returns {{ code: string; issuer?: string } | null}
 */
function parseAssetParam(raw) {
  if (!raw) return null;
  if (raw.toLowerCase() === 'native' || raw.toUpperCase() === 'XLM') return { code: 'XLM' };
  const parts = raw.split(':');
  if (parts.length !== 2 || !parts[0] || !StrKey.isValidEd25519PublicKey(parts[1])) return null;
  return { code: parts[0], issuer: parts[1] };
}

function buildAsset({ code, issuer }) {
  return code === 'XLM' && !issuer ? Asset.native() : new Asset(code, issuer);
}

/**
 * Check whether a Stellar account has a trustline for the given asset.
 * @param {string} horizonUrl
 * @param {string} account
 * @param {{ code: string; issuer?: string }} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<boolean>}
 */
async function hasTrustline(horizonUrl, account, asset, fetchImpl) {
  if (asset.code === 'XLM' && !asset.issuer) return true; // native always OK
  try {
    const resp = await fetchImpl(`${horizonUrl}/accounts/${encodeURIComponent(account)}`);
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.balances?.some(
      (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
    ) ?? false;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   stellarConfig: { horizonUrl: string; networkPassphrase: string };
 *   fetchImpl?: typeof fetch;
 * }} options
 */
export function createPathPaymentRoutes({ stellarConfig, fetchImpl = globalThis.fetch }) {
  const router = Router();
  const { horizonUrl } = stellarConfig;

  // GET /payment-paths — discover available paths via Horizon
  router.get('/', async (req, res) => {
    const { source_account, destination_asset, destination_amount, source_asset } = req.query;

    if (!source_account || !StrKey.isValidEd25519PublicKey(String(source_account))) {
      return res.status(400).json({ error: 'source_account must be a valid Stellar address' });
    }
    const destAsset = parseAssetParam(String(destination_asset ?? ''));
    if (!destAsset) {
      return res.status(400).json({ error: 'destination_asset must be "native" or "CODE:ISSUER"' });
    }
    if (!destination_amount || isNaN(parseFloat(String(destination_amount)))) {
      return res.status(400).json({ error: 'destination_amount must be a number' });
    }

    const srcAsset = source_asset ? parseAssetParam(String(source_asset)) : { code: 'XLM' };
    if (!srcAsset) {
      return res.status(400).json({ error: 'source_asset must be "native" or "CODE:ISSUER"' });
    }

    // Check destination trustline upfront
    const trustlineOk = await hasTrustline(horizonUrl, String(source_account), destAsset, fetchImpl);
    if (!trustlineOk) {
      return res.status(422).json({
        error: 'Account missing trustline for destination asset',
        code: 'MISSING_TRUSTLINE',
        asset: `${destAsset.code}:${destAsset.issuer ?? 'native'}`,
      });
    }

    // Build Horizon path-finding URL
    const params = new URLSearchParams({
      source_account: String(source_account),
      destination_amount: String(destination_amount),
      destination_asset_type: destAsset.code === 'XLM' && !destAsset.issuer ? 'native' : 'credit_alphanum4',
      ...(destAsset.issuer ? { destination_asset_code: destAsset.code, destination_asset_issuer: destAsset.issuer } : {}),
      source_asset_type: srcAsset.code === 'XLM' && !srcAsset.issuer ? 'native' : 'credit_alphanum4',
      ...(srcAsset.issuer ? { source_asset_code: srcAsset.code, source_asset_issuer: srcAsset.issuer } : {}),
    });

    try {
      const horizonResp = await fetchImpl(
        `${horizonUrl}/paths/strict-receive?${params.toString()}`,
      );
      if (!horizonResp.ok) {
        if (horizonResp.status === 404) {
          return res.status(404).json({ error: 'No payment path found', code: 'NO_PATH' });
        }
        return res.status(502).json({ error: 'Horizon path-finding failed', status: horizonResp.status });
      }
      const data = await horizonResp.json();
      return res.json({
        paths: (data._embedded?.records ?? []).map((record) => ({
          sourceAmount: record.source_amount,
          sourceAsset: record.source_asset_type === 'native' ? 'XLM' : `${record.source_asset_code}:${record.source_asset_issuer}`,
          destinationAmount: record.destination_amount,
          destinationAsset: record.destination_asset_type === 'native' ? 'XLM' : `${record.destination_asset_code}:${record.destination_asset_issuer}`,
          path: record.path ?? [],
        })),
      });
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach Horizon', detail: err.message });
    }
  });

  // POST /payment-paths/claim — validate slippage and return XDR for wallet to sign
  router.post('/claim', async (req, res) => {
    const {
      walletAddress,
      destinationAsset,
      destinationAmount,
      sendAsset,
      path: hopPath = [],
      maxSendAmount,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
    } = req.body ?? {};

    if (!StrKey.isValidEd25519PublicKey(String(walletAddress ?? ''))) {
      return res.status(400).json({ error: 'walletAddress must be a valid Stellar address' });
    }
    const destAsset = parseAssetParam(String(destinationAsset ?? ''));
    if (!destAsset) {
      return res.status(400).json({ error: 'destinationAsset must be "native" or "CODE:ISSUER"' });
    }
    if (!destinationAmount || isNaN(parseFloat(String(destinationAmount)))) {
      return res.status(400).json({ error: 'destinationAmount must be a number' });
    }
    if (!maxSendAmount || isNaN(parseFloat(String(maxSendAmount)))) {
      return res.status(400).json({ error: 'maxSendAmount is required' });
    }

    const slippage = Number(slippageBps);
    if (!Number.isInteger(slippage) || slippage < 0 || slippage > MAX_SLIPPAGE_BPS) {
      return res.status(400).json({
        error: `slippageBps must be 0–${MAX_SLIPPAGE_BPS}`,
        maxAllowed: MAX_SLIPPAGE_BPS,
      });
    }

    const srcAsset = sendAsset ? parseAssetParam(String(sendAsset)) : { code: 'XLM' };
    if (!srcAsset) {
      return res.status(400).json({ error: 'sendAsset must be "native" or "CODE:ISSUER"' });
    }

    // Check destination trustline
    const trustlineOk = await hasTrustline(horizonUrl, String(walletAddress), destAsset, fetchImpl);
    if (!trustlineOk) {
      return res.status(422).json({
        error: 'Account missing trustline for destination asset. Add a trustline before claiming.',
        code: 'MISSING_TRUSTLINE',
        asset: destAsset.issuer ? `${destAsset.code}:${destAsset.issuer}` : 'XLM',
      });
    }

    // Apply slippage to maxSendAmount: max_send * (1 + slippage/10000)
    const rawMax = parseFloat(String(maxSendAmount));
    const adjustedMax = (rawMax * (1 + slippage / 10_000)).toFixed(7);

    // Return the parameters for the frontend to build + sign the PathPaymentStrictReceive tx
    // (We don't hold the user's key — return validated params so frontend can build the tx)
    return res.json({
      walletAddress,
      sendAsset: srcAsset,
      sendMax: adjustedMax,
      destinationAsset: destAsset,
      destinationAmount: String(destinationAmount),
      path: hopPath,
      slippageBps: slippage,
    });
  });

  return router;
}
