/**
 * Shared Stellar / Soroban constants and utility helpers.
 *
 * Centralizes configuration and common routines so that Landing, ClaimRewards,
 * and future components can reuse them without duplication.
 */

import {
  Address,
  Contract,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";

/* ---------- environment configuration ---------- */

import {
  SOROBAN_RPC_URL,
  REWARDS_CONTRACT_ID,
  CAMPAIGN_CONTRACT_ID,
  NETWORK_PASSPHRASE,
  HORIZON_URL,
} from "./config";

/* ---------- Freighter helpers ---------- */

/**
 * Return the injected Freighter browser API or throw.
 */
export function getFreighterApi() {
  const freighterApi = window.freighterApi;

  if (!freighterApi) {
    throw new Error(
      "Freighter API is unavailable. Install or unlock the Freighter browser extension.",
    );
  }

  return freighterApi;
}

/**
 * Connect the Freighter wallet and return the public key.
 */
export async function getWalletAddress() {
  const freighterApi = getFreighterApi();

  const freighterStatus = await freighterApi.isConnected();
  if (freighterStatus.error) throw new Error(freighterStatus.error);
  if (!freighterStatus.isConnected) {
    throw new Error(
      "Freighter extension was not detected. Install or unlock Freighter to connect a wallet.",
    );
  }

  const existingAddress = await freighterApi.getAddress();
  if (existingAddress.error) throw new Error(existingAddress.error);
  if (existingAddress.address) return existingAddress.address;

  const access = await freighterApi.requestAccess();
  if (access.error) throw new Error(access.error);
  if (!access.address)
    throw new Error("Freighter did not return a wallet address.");

  return access.address;
}

/* ---------- formatting ---------- */

/**
 * Safely format a raw balance value (bigint | number) to a display string.
 */
export function formatPoints(points) {
  if (typeof points === "bigint") return points.toString();
  if (typeof points === "number") return String(points);
  return "0";
}

/**
 * Format a native XLM balance string for compact UI display.
 */
export function formatWalletBalance(balance) {
  const numericBalance = Number(balance);
  if (!Number.isFinite(numericBalance)) return "0 XLM";
  return `${numericBalance.toFixed(2)} XLM`;
}

/**
 * Turn an unknown error value into a human-readable message.
 */
export function normalizeError(error) {
  if (!error) return "Unable to load points right now.";

  const message =
    typeof error === "string"
      ? error
      : error.message ||
        error.toString?.() ||
        "Unable to load points right now.";

  if (/not found|missing|404/i.test(message)) {
    return "Rewards contract is not deployed on the configured Soroban network yet.";
  }

  if (/unsupported address type/i.test(message)) {
    return "Connected wallet address is invalid for Soroban calls.";
  }

  return message;
}

/* ---------- contract read helpers ---------- */

/**
 * Fetch the connected account's native XLM balance from Horizon.
 */
export async function fetchWalletBalance(walletAddress) {
  const response = await fetch(
    `${HORIZON_URL}/accounts/${encodeURIComponent(walletAddress)}`,
  );

  if (!response.ok) {
    throw new Error(
      `Horizon returned ${response.status} while loading the wallet balance.`,
    );
  }

  const account = await response.json();
  const nativeBalance = account.balances?.find(
    (balance) => balance.asset_type === "native",
  );

  return nativeBalance?.balance || "0";
}

/**
 * Simulate a read-only `balance(user)` call and return the raw result.
 */
export async function fetchRewardsBalance(walletAddress) {
  if (!REWARDS_CONTRACT_ID) {
    throw new Error("Set VITE_REWARDS_CONTRACT_ID to load on-chain points.");
  }

  const server = new rpc.Server(SOROBAN_RPC_URL);
  const sourceAccount = await server.getAccount(walletAddress);
  const contract = new Contract(REWARDS_CONTRACT_ID);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "balance",
        nativeToScVal(Address.fromString(walletAddress)),
      ),
    )
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);

  if (simulation.error) throw new Error(simulation.error);
  if (!simulation.result) {
    throw new Error("Soroban RPC returned no result for rewards balance.");
  }

  return scValToNative(simulation.result.retval);
}

/* ---------- contract write helpers ---------- */

const TX_POLL_INTERVAL_MS = 1500;
const TX_POLL_MAX_ATTEMPTS = 40;

/**
 * Build, sign (Freighter), submit, and poll a `claim(user, amount)` call.
 *
 * Returns `{ hash: string, newBalance: string }` on success.
 */
export async function submitClaimTransaction(walletAddress, amount) {
  if (!REWARDS_CONTRACT_ID) {
    throw new Error("Set VITE_REWARDS_CONTRACT_ID before claiming rewards.");
  }

  const server = new rpc.Server(SOROBAN_RPC_URL);
  const sourceAccount = await server.getAccount(walletAddress);
  const contract = new Contract(REWARDS_CONTRACT_ID);

  /* 1. Build the transaction */
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "claim",
        nativeToScVal(Address.fromString(walletAddress)),
        nativeToScVal(amount, { type: "u64" }),
      ),
    )
    .setTimeout(30)
    .build();

  /* 2. Simulate & prepare (assembles auth + resources) */
  const preparedTx = await server.prepareTransaction(tx);

  /* 3. Sign with Freighter */
  const freighterApi = getFreighterApi();
  const signResult = await freighterApi.signTransaction(preparedTx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: walletAddress,
  });

  if (signResult.error) throw new Error(signResult.error);

  /* 4. Re-construct the signed transaction */
  const signedTx = TransactionBuilder.fromXDR(
    signResult.signedTxXdr,
    NETWORK_PASSPHRASE,
  );

  /* 5. Submit */
  const sendResult = await server.sendTransaction(signedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(
      sendResult.errorResult?.toString() || "Transaction submission failed.",
    );
  }

  /* 6. Poll until finalised */
  let getResult;
  for (let i = 0; i < TX_POLL_MAX_ATTEMPTS; i++) {
    // eslint-disable-next-line no-await-in-loop
    getResult = await server.getTransaction(sendResult.hash);
    if (getResult.status !== "NOT_FOUND") break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
  }

  if (!getResult || getResult.status === "NOT_FOUND") {
    throw new Error(
      "Transaction was submitted but could not be confirmed in time.",
    );
  }

  if (getResult.status === "FAILED") {
    throw new Error(
      "Transaction failed on-chain. You may not have enough points.",
    );
  }

  const newBalance = getResult.returnValue
    ? formatPoints(scValToNative(getResult.returnValue))
    : null;

  return { hash: sendResult.hash, newBalance };
}

/* ---------- campaign contract helpers ---------- */

/**
 * Simulate a read-only `is_participant(participant)` call.
 *
 * Returns `true` if the wallet is already registered, `false` otherwise.
 */
export async function checkParticipantStatus(walletAddress) {
  if (!CAMPAIGN_CONTRACT_ID) {
    throw new Error(
      "Set VITE_CAMPAIGN_CONTRACT_ID to check participant status.",
    );
  }

  const server = new rpc.Server(SOROBAN_RPC_URL);
  const sourceAccount = await server.getAccount(walletAddress);
  const contract = new Contract(CAMPAIGN_CONTRACT_ID);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "is_participant",
        nativeToScVal(Address.fromString(walletAddress)),
      ),
    )
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
  if (!CAMPAIGN_CONTRACT_ID) {
    throw new Error("Set VITE_CAMPAIGN_CONTRACT_ID before registering.");
  }

  const server = new rpc.Server(SOROBAN_RPC_URL);
  const sourceAccount = await server.getAccount(walletAddress);
  const contract = new Contract(CAMPAIGN_CONTRACT_ID);

  // For open registration, pass empty leaf and proof
  const emptyLeaf = new Uint8Array(32); // 32 bytes of zeros
  const emptyProof = []; // Empty proof array

  /* 1. Build */
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "register",
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
    networkPassphrase: NETWORK_PASSPHRASE,
    address: walletAddress,
  });

  if (signResult.error) throw new Error(signResult.error);

  /* 4. Re-construct signed transaction */
  const signedTx = TransactionBuilder.fromXDR(
    signResult.signedTxXdr,
    NETWORK_PASSPHRASE,
  );

  /* 5. Submit */
  const sendResult = await server.sendTransaction(signedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(
      sendResult.errorResult?.toString() || "Registration transaction failed.",
    );
  }

  /* 6. Poll until finalised */
  let getResult;
  for (let i = 0; i < TX_POLL_MAX_ATTEMPTS; i++) {
    // eslint-disable-next-line no-await-in-loop
    getResult = await server.getTransaction(sendResult.hash);
    if (getResult.status !== "NOT_FOUND") break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
  }

  if (!getResult || getResult.status === "NOT_FOUND") {
    throw new Error(
      "Registration transaction was submitted but could not be confirmed in time.",
    );
  }

  if (getResult.status === "FAILED") {
    throw new Error("Registration transaction failed on-chain.");
  }

  // Contract returns true for a fresh registration, false if already registered.
  const wasNew = getResult.returnValue
    ? scValToNative(getResult.returnValue)
    : true;

  return { hash: sendResult.hash, alreadyRegistered: !wasNew };
}
