/**
 * CLI configuration — network, API key, and contract IDs.
 * Reads from env first, then from the persisted config store.
 */

import Conf from 'conf';

export const store = new Conf({ projectName: 'trivela-cli' });

export const DEFAULTS = {
  network: 'testnet',
  apiUrl: 'http://localhost:3001',
};

export function getConfig() {
  return {
    network: process.env.STELLAR_NETWORK ?? store.get('network', DEFAULTS.network),
    apiUrl:
      process.env.TRIVELA_API_URL ?? store.get('apiUrl', DEFAULTS.apiUrl),
    apiKey: process.env.TRIVELA_API_KEY ?? store.get('apiKey', ''),
    source: process.env.STELLAR_SOURCE ?? store.get('source', ''),
    rewardsContractId:
      process.env.REWARDS_CONTRACT_ID ?? store.get('rewardsContractId', ''),
    campaignContractId:
      process.env.CAMPAIGN_CONTRACT_ID ?? store.get('campaignContractId', ''),
  };
}

export function setConfig(key, value) {
  store.set(key, value);
}

export function isMainnet(cfg) {
  return cfg.network === 'mainnet';
}
