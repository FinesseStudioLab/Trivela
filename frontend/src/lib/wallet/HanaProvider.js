import { WalletProvider } from './WalletProvider.js';

export class HanaProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Hana';
  }

  getName() {
    return this.name;
  }

  getApi() {
    if (!window?.hana?.stellar) {
      throw new Error('Hana wallet is unavailable. Install or unlock the Hana browser extension.');
    }
    return window.hana.stellar;
  }

  async isAvailable() {
    try {
      return !!window?.hana?.stellar;
    } catch {
      return false;
    }
  }

  async isConnected() {
    try {
      const api = this.getApi();
      return !!(await api.isConnected());
    } catch {
      return false;
    }
  }

  async connect() {
    const api = this.getApi();
    const result = await api.connect();
    if (!result?.publicKey) {
      throw new Error('Hana did not return a wallet address.');
    }
    return result.publicKey;
  }

  async disconnect() {
    try {
      const api = this.getApi();
      if (typeof api.disconnect === 'function') {
        await api.disconnect();
      }
    } catch {
      // Extension may not support explicit disconnect
    }
    return true;
  }

  async getAddress() {
    const api = this.getApi();
    const result = (await api.getPublicKey?.()) ?? (await api.connect());
    if (!result?.publicKey && typeof result !== 'string') {
      throw new Error('No address available. Please connect your wallet first.');
    }
    return typeof result === 'string' ? result : result.publicKey;
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();
    const result = await api.signTransaction(xdr, {
      networkPassphrase: options.networkPassphrase,
    });
    if (!result?.signedTxXdr) {
      throw new Error('Hana did not return a signed transaction.');
    }
    return result.signedTxXdr;
  }
}
