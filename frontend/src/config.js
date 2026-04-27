import { Contract, Networks, rpc } from '@stellar/stellar-sdk';

const STELLAR_NETWORKS = {
  testnet: {
    network: 'testnet',
    networkPassphrase: Networks.TESTNET,
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  mainnet: {
    network: 'mainnet',
    networkPassphrase: Networks.PUBLIC,
    sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
  },
};

const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function validateFrontendEnv(env = import.meta.env) {
  const errors = [];

  const apiUrl = env.VITE_API_URL;
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push(`VITE_API_URL must be http(s): "${apiUrl}"`);
      }
    } catch {
      errors.push(`VITE_API_URL must be a valid URL: "${apiUrl}"`);
    }
  }

  const network = env.VITE_STELLAR_NETWORK;
  if (network && !STELLAR_NETWORKS[String(network).trim().toLowerCase()]) {
    errors.push(
      `Unsupported VITE_STELLAR_NETWORK "${network}". Expected one of: ${Object.keys(STELLAR_NETWORKS).join(', ')}`,
    );
  }

  const rewardsContractId = env.VITE_REWARDS_CONTRACT_ID;
  if (rewardsContractId && !CONTRACT_ID_PATTERN.test(String(rewardsContractId).trim())) {
    errors.push('VITE_REWARDS_CONTRACT_ID must be a valid Stellar contract ID');
  }

  const campaignContractId = env.VITE_CAMPAIGN_CONTRACT_ID;
  if (campaignContractId && !CONTRACT_ID_PATTERN.test(String(campaignContractId).trim())) {
    errors.push('VITE_CAMPAIGN_CONTRACT_ID must be a valid Stellar contract ID');
  }

  if (errors.length > 0) {
    throw new Error(
      ['Invalid frontend environment configuration:', ...errors.map((e) => `- ${e}`)].join('\n'),
    );
  }
}

function resolveNetworkConfig({
  network = 'testnet',
  networkPassphrase,
  sorobanRpcUrl,
  horizonUrl,
} = {}) {
  const normalizedNetwork = String(network || 'testnet')
    .trim()
    .toLowerCase();
  const preset = STELLAR_NETWORKS[normalizedNetwork] ?? STELLAR_NETWORKS.testnet;

  return {
    network: normalizedNetwork,
    networkPassphrase: networkPassphrase || preset.networkPassphrase,
    sorobanRpcUrl: sorobanRpcUrl || preset.sorobanRpcUrl,
    horizonUrl: horizonUrl || preset.horizonUrl,
  };
}

validateFrontendEnv();

export const API_BASE_URL = trimTrailingSlash(import.meta.env.VITE_API_URL || '');

const DEV_NETWORK_STORAGE_KEY = 'trivela:stellarNetwork';

let runtimeConfig = {
  stellar: resolveNetworkConfig({
    network: import.meta.env.DEV
      ? (typeof window !== 'undefined'
          ? window.localStorage.getItem(DEV_NETWORK_STORAGE_KEY)
          : null) || import.meta.env.VITE_STELLAR_NETWORK
      : import.meta.env.VITE_STELLAR_NETWORK,
    networkPassphrase: import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE,
    sorobanRpcUrl: import.meta.env.VITE_SOROBAN_RPC_URL,
    horizonUrl: import.meta.env.VITE_HORIZON_URL,
  }),
  contracts: {
    rewards: import.meta.env.VITE_REWARDS_CONTRACT_ID || '',
    campaign: import.meta.env.VITE_CAMPAIGN_CONTRACT_ID || '',
  },
  sources: {
    stellar: 'env',
    contracts: 'env',
  },
};

export function apiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${API_BASE_URL}${path}`;
}

export async function initializeRuntimeConfig(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    return getRuntimeConfig();
  }

  try {
    const response = await fetchImpl(apiUrl('/api/v1/config'));
    if (!response.ok) {
      return getRuntimeConfig();
    }

    const payload = await response.json();
    runtimeConfig = {
      stellar: resolveNetworkConfig({
        ...runtimeConfig.stellar,
        ...payload.stellar,
      }),
      contracts: {
        rewards: payload.contracts?.rewards ?? runtimeConfig.contracts.rewards,
        campaign: payload.contracts?.campaign ?? runtimeConfig.contracts.campaign,
      },
      sources: {
        stellar: 'backend',
        contracts: 'backend',
      },
    };
  } catch (_error) {
    return getRuntimeConfig();
  }

  return getRuntimeConfig();
}

export function getRuntimeConfig() {
  return {
    stellar: { ...runtimeConfig.stellar },
    contracts: { ...runtimeConfig.contracts },
    sources: { ...runtimeConfig.sources },
  };
}

export function setRuntimeStellarNetwork(network) {
  const next = resolveNetworkConfig({ network });
  runtimeConfig = {
    ...runtimeConfig,
    stellar: next,
    sources: {
      ...runtimeConfig.sources,
      stellar: 'dev-switcher',
    },
  };

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.localStorage.setItem(DEV_NETWORK_STORAGE_KEY, next.network);
  }

  return getRuntimeConfig();
}

export function getSorobanRpcUrl() {
  return runtimeConfig.stellar.sorobanRpcUrl;
}

export function getHorizonUrl() {
  return runtimeConfig.stellar.horizonUrl;
}

export function getNetworkPassphrase() {
  return runtimeConfig.stellar.networkPassphrase;
}

export function getStellarNetwork() {
  return runtimeConfig.stellar.network;
}

export function getRewardsContractId() {
  return runtimeConfig.contracts.rewards;
}

export function getCampaignContractId() {
  return runtimeConfig.contracts.campaign;
}

export function createSorobanServer() {
  return new rpc.Server(getSorobanRpcUrl());
}

export function getRewardsContract() {
  const contractId = getRewardsContractId();
  return contractId ? new Contract(contractId) : null;
}

export function getCampaignContract() {
  const contractId = getCampaignContractId();
  return contractId ? new Contract(contractId) : null;
}
