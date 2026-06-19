import { Networks } from '@stellar/stellar-sdk';

export const STELLAR_NETWORKS = {
  testnet: {
    network: 'testnet',
    networkPassphrase: Networks.TESTNET,
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    explorerUrl: 'https://stellar.expert/explorer/testnet',
  },
  mainnet: {
    network: 'mainnet',
    networkPassphrase: Networks.PUBLIC,
    sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
    explorerUrl: 'https://stellar.expert/explorer/public',
  },
};

export const DEFAULT_STELLAR_NETWORK = 'testnet';

export function resolveStellarNetworkConfig({
  network = DEFAULT_STELLAR_NETWORK,
  sorobanRpcUrl,
  horizonUrl,
  networkPassphrase,
} = {}) {
  const normalizedNetwork = String(network || DEFAULT_STELLAR_NETWORK)
    .trim()
    .toLowerCase();
  const preset = STELLAR_NETWORKS[normalizedNetwork];

  if (!preset) {
    throw new Error(
      `Unsupported STELLAR_NETWORK "${network}". Expected one of: ${Object.keys(STELLAR_NETWORKS).join(', ')}`,
    );
  }

  return {
    network: normalizedNetwork,
    networkPassphrase: networkPassphrase || preset.networkPassphrase,
    sorobanRpcUrl: sorobanRpcUrl || preset.sorobanRpcUrl,
    horizonUrl: horizonUrl || preset.horizonUrl,
    explorerUrl: preset.explorerUrl,
  };
}
