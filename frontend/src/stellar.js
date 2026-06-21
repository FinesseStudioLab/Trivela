/**
 * Shared Stellar / Soroban constants and utility helpers.
 *
 * Centralizes configuration and common routines so that Landing, ClaimRewards,
 * and future components can reuse them without duplication.
 */

import {
  Address,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import {
  createSorobanServer,
  getCampaignContractId,
  getHorizonUrl,
  getNetworkPassphrase,
  getCampaignContract,
  getRewardsContract,
  getStellarNetwork,
  getRewardsContractId,
  getSorobanRpcUrl,
} from './config';
import { Client as RewardsClient } from './contracts/rewards';
import { Client as CampaignClient } from './contracts/campaign';
import { ERROR_MESSAGES, getErrorMessage } from './lib/errorMapping';
import { walletManager } from './lib/wallet/index.js';

export {
  getCampaignContractId,
  getNetworkPassphrase,
  getStellarNetwork,
  getRewardsContractId,
} from './config';

/* ---------- Wallet helpers ---------- */

export async function connectWallet(providerName = 'Freighter') {
  return walletManager.connect(providerName);
}

export async function disconnectWallet() {
  return walletManager.disconnect();
}

export async function getWalletAddress() {
  return walletManager.getAddress();
}

export async function isWalletConnected() {
  return walletManager.isConnected();
}

export async function getAvailableWallets() {
  return walletManager.getAvailableProviders();
}

export function getActiveWallet() {
  return walletManager.getActiveProviderName();
}

/* ---------- Legacy Freighter helpers (deprecated) ---------- */

export function getFreighterApi() {
  const freighterApi = window.freighterApi;

  if (!freighterApi) {
    throw new Error(
      'Freighter API is unavailable. Install or unlock the Freighter browser extension.',
    );
  }

  return freighterApi;
}

/* ---------- formatting ---------- */

export function formatPoints(points) {
  if (typeof points === 'bigint') return points.toString();
  if (typeof points === 'number') return String(points);
  return '0';
}

/**
 * Format a native XLM balance string for compact UI display.
 */
export function formatWalletBalance(balance) {
  const numericBalance = Number(balance);
  if (!Number.isFinite(numericBalance)) return '0 XLM';
  return `${numericBalance.toFixed(2)} XLM`;
}

/**
 * Turn an unknown error value into a human-readable message.
 */
export function normalizeError(error) {
  if (!error) return 'Unable to load points right now.';

  const extractErrorCode = (value) => {
    const text = typeof value === 'string' ? value : value?.message || value?.toString?.() || '';

    const patterns = [/Error\(Contract,\s*#(\d+)\)/i, /contract.*?#(\d+)/i, /code[:\s]+(\d+)/i];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }

    return null;
  };

  const message =
    typeof error === 'string'
      ? error
      : error.message || error.toString?.() || 'Unable to load points right now.';

  const errorCode = extractErrorCode(error);
  if (typeof errorCode === 'number' && Number.isFinite(errorCode)) {
    if (ERROR_MESSAGES[errorCode]) return getErrorMessage(errorCode);
  }

  if (/not found|missing|404/i.test(message)) {
    return 'Rewards contract is not deployed on the configured Soroban network yet.';
  }

  if (/unsupported address type/i.test(message)) {
    return 'Connected wallet address is invalid for Soroban calls.';
  }

  return message;
}

/* ---------- contract read helpers ---------- */

/**
 * Fetch the connected account's native XLM balance from Horizon.
 */
export async function fetchWalletBalance(walletAddress) {
  const response = await fetch(`${getHorizonUrl()}/accounts/${encodeURIComponent(walletAddress)}`);

  if (!response.ok) {
    throw new Error(`Horizon returned ${response.status} while loading the wallet balance.`);
  }

  const account = await response.json();
  const nativeBalance = account.balances?.find((balance) => balance.asset_type === 'native');

  return nativeBalance?.balance || '0';
}

/**
 * Simulate a read-only `balance(user)` call and return the raw result.
 */
export async function fetchRewardsBalance(walletAddress) {
  const contractId = getRewardsContractId();
  if (!contractId) {
    throw new Error('Set VITE_REWARDS_CONTRACT_ID to load on-chain points.');
  }

  const client = new RewardsClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
  });

  const tx = await client.balance({ user: walletAddress });
  return await tx.simulate();
}

/* ---------- contract write helpers ---------- */

export async function submitClaimTransaction(walletAddress, amount) {
  const contractId = getRewardsContractId();
  if (!contractId) {
    throw new Error('Set VITE_REWARDS_CONTRACT_ID before claiming rewards.');
  }

  const client = new RewardsClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const tx = await client.claim({
    user: walletAddress,
    amount: BigInt(amount),
  });

  const newBalanceVal = await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');
  const newBalance = formatPoints(newBalanceVal);

  return { hash, newBalance };
}

/* ---------- campaign contract helpers ---------- */

export async function fetchCampaignOnChainState(contractId) {
  const resolvedId = contractId || getCampaignContractId();
  if (!resolvedId) {
    return null;
  }

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId: resolvedId,
  });

  const [isActive, isWithinWindow, participantCount] = await Promise.all([
    client.is_active().then((tx) => tx.simulate()),
    client.is_within_window().then((tx) => tx.simulate()),
    client.get_participant_count().then((tx) => tx.simulate()),
  ]);

  return {
    isActive,
    isWithinWindow,
    participantCount: Number(participantCount),
  };
}

export async function checkParticipantStatus(walletAddress) {
  const contractId = getCampaignContractId();
  if (!contractId) {
    throw new Error('Set VITE_CAMPAIGN_CONTRACT_ID to check participant status.');
  }

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
  });

  const tx = await client.is_participant({ participant: walletAddress });
  return await tx.simulate();
}

/**
 * Build, sign (Freighter), submit, and poll a `register(participant, leaf, proof)` call
 * on the campaign contract.
 *
 * Returns `{ hash: string, alreadyRegistered: boolean }`.
 * - `alreadyRegistered === false` means the user was freshly registered.
 * - `alreadyRegistered === true` means they were already registered (contract returned false).
 */
export async function submitRegisterTransaction(walletAddress) {
  const contractId = getCampaignContractId();
  if (!contractId) {
    throw new Error('Set VITE_CAMPAIGN_CONTRACT_ID before registering.');
  }

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const emptyLeaf = new Uint8Array(32); // 32 bytes of zeros
  const emptyProof = []; // Empty proof array

  const tx = await client.register({
    participant: walletAddress,
    leaf: emptyLeaf,
    proof: emptyProof,
  });

  const wasNew = await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');

  return { hash, alreadyRegistered: !wasNew };
}

/**
 * Initialize a campaign contract with the admin address.
 *
 * This is a simplified version that assumes the contract is already deployed
 * and just needs to be initialized with an admin.
 *
 * For full deployment (WASM upload + contract creation), use backend deployment
 * service or stellar-cli.
 *
 * Returns `{ hash: string }`.
 *
 * @param {string} walletAddress - The admin wallet address
 * @param {string} contractId - The deployed contract ID
 */
export async function initializeCampaignContract(walletAddress, contractId) {
  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const tx = await client.initialize({ admin: walletAddress });
  await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');

  return { hash };
}

/* ---------- Admin campaign contract helpers ---------- */

/**
 * Get the current admin nonce for the campaign contract
 */
export async function getCampaignAdminNonce(contractId) {
  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
  });

  const tx = await client.admin_nonce();
  return await tx.simulate();
}

/**
 * Set campaign active status (admin only)
 */
export async function setCampaignActive(walletAddress, contractId, active) {
  const nonce = await getCampaignAdminNonce(contractId);

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const tx = await client.set_active({
    admin: walletAddress,
    nonce,
    active,
  });

  await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');
  return { hash };
}

/**
 * Set campaign registration window (admin only)
 */
export async function setCampaignWindow(walletAddress, contractId, startTime, endTime) {
  const nonce = await getCampaignAdminNonce(contractId);

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const tx = await client.set_window({
    admin: walletAddress,
    nonce,
    start: BigInt(startTime),
    end: BigInt(endTime),
  });

  await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');
  return { hash };
}

/**
 * Set campaign maximum participant cap (admin only)
 */
export async function setCampaignMaxCap(walletAddress, contractId, maxCap) {
  const nonce = await getCampaignAdminNonce(contractId);

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const tx = await client.set_max_cap({
    admin: walletAddress,
    nonce,
    max_cap: BigInt(maxCap),
  });

  await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');
  return { hash };
}

/**
 * Set campaign Merkle root for allowlist (admin only)
 */
export async function setCampaignMerkleRoot(walletAddress, contractId, merkleRoot) {
  const nonce = await getCampaignAdminNonce(contractId);

  const client = new CampaignClient({
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    contractId,
    publicKey: walletAddress,
    signTransaction: async (txXdr) => {
      const signedTxXdr = await walletManager.signTransaction(txXdr, {
        networkPassphrase: getNetworkPassphrase(),
        address: walletAddress,
      });
      return { signedTxXdr };
    },
  });

  const tx = await client.set_merkle_root({
    admin: walletAddress,
    nonce,
    root: merkleRoot,
  });

  await tx.signAndSend();
  const hash = tx.signed.hash().toString('hex');
  return { hash };
}
