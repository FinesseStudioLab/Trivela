/**
 * Shared Stellar / Soroban constants and utility helpers.
 *
 * Centralizes configuration and common routines so that Landing, ClaimRewards,
 * and future components can reuse them without duplication.
 */

import {
  Address,
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
} from './config';
import { ERROR_MESSAGES, getErrorMessage } from './lib/errorMapping';

export {
  getCampaignContractId,
  getNetworkPassphrase,
  getStellarNetwork,
  getRewardsContractId,
} from './config';

/* ---------- Freighter helpers ---------- */

export function getFreighterApi() {
  const freighterApi = window.freighterApi;

  if (!freighterApi) {
    throw new Error(
      'Freighter API is unavailable. Install or unlock the Freighter browser extension.',
    );
  }

  return freighterApi;
}

export async function getWalletAddress() {
  const freighterApi = getFreighterApi();

  const freighterStatus = await freighterApi.isConnected();
  if (freighterStatus.error) throw new Error(freighterStatus.error);
  if (!freighterStatus.isConnected) {
    throw new Error(
      'Freighter extension was not detected. Install or unlock Freighter to connect a wallet.',
    );
  }

  const existingAddress = await freighterApi.getAddress();
  if (existingAddress.error) throw new Error(existingAddress.error);
  if (existingAddress.address) return existingAddress.address;

  const access = await freighterApi.requestAccess();
  if (access.error) throw new Error(access.error);
  if (!access.address) {
    throw new Error('Freighter did not return a wallet address.');
  }

  return access.address;
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
  const contract = getRewardsContract();
  if (!contract) {
    throw new Error('Set VITE_REWARDS_CONTRACT_ID to load on-chain points.');
  }

  const server = createSorobanServer();
  const sourceAccount = await server.getAccount(walletAddress);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call('balance', nativeToScVal(Address.fromString(walletAddress))))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);

  if (simulation.error) throw new Error(simulation.error);
  if (!simulation.result) {
    throw new Error('Soroban RPC returned no result for rewards balance.');
  }

  return scValToNative(simulation.result.retval);
}

/* ---------- contract write helpers ---------- */

const TX_POLL_INTERVAL_MS = 1500;
const TX_POLL_MAX_ATTEMPTS = 40;

export async function submitClaimTransaction(walletAddress, amount) {
  const contract = getRewardsContract();
  if (!contract) {
    throw new Error('Set VITE_REWARDS_CONTRACT_ID before claiming rewards.');
  }

  const server = createSorobanServer();
  const sourceAccount = await server.getAccount(walletAddress);

  /* 1. Build the transaction */
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      contract.call(
        'claim',
        nativeToScVal(Address.fromString(walletAddress)),
        nativeToScVal(amount, { type: 'u64' }),
      ),
    )
    .setTimeout(30)
    .build();

  /* 2. Simulate & prepare (assembles auth + resources) */
  const preparedTx = await server.prepareTransaction(tx);

  /* 3. Sign with Freighter */
  const freighterApi = getFreighterApi();
  const signResult = await freighterApi.signTransaction(preparedTx.toXDR(), {
    networkPassphrase: getNetworkPassphrase(),
    address: walletAddress,
  });

  if (signResult.error) throw new Error(signResult.error);

  /* 4. Re-construct the signed transaction */
  const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, getNetworkPassphrase());

  /* 5. Submit */
  const sendResult = await server.sendTransaction(signedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(sendResult.errorResult?.toString() || 'Transaction submission failed.');
  }

  /* 6. Poll until finalised */
  let getResult;
  for (let i = 0; i < TX_POLL_MAX_ATTEMPTS; i++) {
    // eslint-disable-next-line no-await-in-loop
    getResult = await server.getTransaction(sendResult.hash);
    if (getResult.status !== 'NOT_FOUND') break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
  }

  if (!getResult || getResult.status === 'NOT_FOUND') {
    throw new Error('Transaction was submitted but could not be confirmed in time.');
  }

  if (getResult.status === 'FAILED') {
    throw new Error('Transaction failed on-chain. You may not have enough points.');
  }

  const newBalance = getResult.returnValue
    ? formatPoints(scValToNative(getResult.returnValue))
    : null;

  return { hash: sendResult.hash, newBalance };
}

/* ---------- campaign contract helpers ---------- */

export async function checkParticipantStatus(walletAddress) {
  const contract = getCampaignContract();
  if (!contract) {
    throw new Error('Set VITE_CAMPAIGN_CONTRACT_ID to check participant status.');
  }

  const server = createSorobanServer();
  const sourceAccount = await server.getAccount(walletAddress);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call('is_participant', nativeToScVal(Address.fromString(walletAddress))))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);

  if (simulation.error) throw new Error(simulation.error);
  if (!simulation.result) return false;

  return scValToNative(simulation.result.retval);
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
  const contract = getCampaignContract();
  if (!contract) {
    throw new Error('Set VITE_CAMPAIGN_CONTRACT_ID before registering.');
  }

  const server = createSorobanServer();
  const sourceAccount = await server.getAccount(walletAddress);

  // For open registration, pass empty leaf and proof
  const emptyLeaf = new Uint8Array(32); // 32 bytes of zeros
  const emptyProof = []; // Empty proof array

  /* 1. Build */
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      contract.call(
        'register',
        nativeToScVal(Address.fromString(walletAddress)),
        nativeToScVal(emptyLeaf),
        nativeToScVal(emptyProof),
      ),
    )
    .setTimeout(30)
    .build();

  /* 2. Simulate & prepare */
  const preparedTx = await server.prepareTransaction(tx);

  /* 3. Sign with Freighter */
  const freighterApi = getFreighterApi();
  const signResult = await freighterApi.signTransaction(preparedTx.toXDR(), {
    networkPassphrase: getNetworkPassphrase(),
    address: walletAddress,
  });

  if (signResult.error) throw new Error(signResult.error);

  /* 4. Re-construct signed transaction */
  const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, getNetworkPassphrase());

  /* 5. Submit */
  const sendResult = await server.sendTransaction(signedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(sendResult.errorResult?.toString() || 'Registration transaction failed.');
  }

  /* 6. Poll until finalised */
  let getResult;
  for (let i = 0; i < TX_POLL_MAX_ATTEMPTS; i++) {
    // eslint-disable-next-line no-await-in-loop
    getResult = await server.getTransaction(sendResult.hash);
    if (getResult.status !== 'NOT_FOUND') break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
  }

  if (!getResult || getResult.status === 'NOT_FOUND') {
    throw new Error('Registration transaction was submitted but could not be confirmed in time.');
  }

  if (getResult.status === 'FAILED') {
    throw new Error('Registration transaction failed on-chain.');
  }

  // Contract returns true for a fresh registration, false if already registered.
  const wasNew = getResult.returnValue ? scValToNative(getResult.returnValue) : true;

  return { hash: sendResult.hash, alreadyRegistered: !wasNew };
}
