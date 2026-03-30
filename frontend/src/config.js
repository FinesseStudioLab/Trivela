/**
 * Environment-based configuration for Trivela frontend.
 *
 * Usage: Set VITE_ENV to "development", "staging", or "production".
 * Individual VITE_* variables can still be used to override any preset value.
 *
 * Example .env.development:
 *   VITE_ENV=development
 *   VITE_API_URL=http://localhost:3001
 *
 * Example .env.staging:
 *   VITE_ENV=staging
 *   VITE_API_URL=https://trivela-api-staging.example.com
 *
 * Example .env.production:
 *   VITE_ENV=production
 *   VITE_API_URL=https://trivela-api.example.com
 */

import { Networks } from "@stellar/stellar-sdk";

/** @type {Record<string, {stellar: {networkPassphrase: string, sorobanRpcUrl: string, horizonUrl: string}, contracts: {rewardsContractId: string, campaignContractId: string}, apiUrl: string}>} */
const ENV_PRESETS = {
  development: {
    stellar: {
      networkPassphrase: Networks.TESTNET,
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
      horizonUrl: "https://horizon-testnet.stellar.org",
    },
    contracts: {
      rewardsContractId: "",
      campaignContractId: "",
    },
    apiUrl: "http://localhost:3001",
  },
  staging: {
    stellar: {
      networkPassphrase: Networks.TESTNET,
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
      horizonUrl: "https://horizon-testnet.stellar.org",
    },
    contracts: {
      rewardsContractId: "",
      campaignContractId: "",
    },
    apiUrl: "",
  },
  production: {
    stellar: {
      networkPassphrase: Networks.MAINNET,
      sorobanRpcUrl: "https://soroban.mainnet.stellar.org",
      horizonUrl: "https://horizon.stellar.org",
    },
    contracts: {
      rewardsContractId: "",
      campaignContractId: "",
    },
    apiUrl: "",
  },
};

/**
 * Resolve a single config value.
 * Priority: explicit env var > preset value
 *
 * @template T
 * @param {T} presetValue
 * @param {string} envKey  - VITE_ prefix is added automatically
 * @returns {T}
 */
function resolve(presetValue, envKey) {
  const envVal = import.meta.env[envKey];
  if (typeof envVal === "string" && envVal.trim() !== "") {
    return envVal;
  }
  return presetValue;
}

function resolveContractId(presetValue, envKey) {
  return resolve(presetValue, envKey);
}

const presetKey = /** @type {keyof typeof ENV_PRESETS} */ (
  import.meta.env.VITE_ENV || "development"
);
const preset = ENV_PRESETS[presetKey] ?? ENV_PRESETS.development;

export const STELLAR_NETWORK_PASSPHRASE = resolve(
  preset.stellar.networkPassphrase,
  "VITE_STELLAR_NETWORK_PASSPHRASE"
);

export const SOROBAN_RPC_URL = resolve(
  preset.stellar.sorobanRpcUrl,
  "VITE_SOROBAN_RPC_URL"
);

export const HORIZON_URL = resolve(
  preset.stellar.horizonUrl,
  "VITE_HORIZON_URL"
);

export const REWARDS_CONTRACT_ID = resolveContractId(
  preset.contracts.rewardsContractId,
  "VITE_REWARDS_CONTRACT_ID"
);

export const CAMPAIGN_CONTRACT_ID = resolveContractId(
  preset.contracts.campaignContractId,
  "VITE_CAMPAIGN_CONTRACT_ID"
);

/** Backend API base URL (no trailing slash). */
export const API_URL = resolve(preset.apiUrl, "VITE_API_URL");

/** Current environment name, one of "development", "staging", "production". */
export const ENV_NAME = presetKey;
