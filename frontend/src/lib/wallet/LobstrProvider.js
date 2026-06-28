import { WalletProvider } from './WalletProvider.js';

export class LobstrProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Lobstr';
  }

  getName() {
    return this.name;
  }

  getApi() {
    const api = window.lobstr ?? window.lobstrApi;
    if (!api) {
      throw new Error('Lobstr is unavailable. Install or unlock the Lobstr browser extension.');
    }
    return api;
  }

  async isAvailable() {
    try {
      return !!(window.lobstr ?? window.lobstrApi);
    } catch {
      return false;
    }
  }

  async isConnected() {
    try {
      return !!(window.lobstr ?? window.lobstrApi);
    } catch {
      return false;
    }
  }

  async connect() {
    const api = this.getApi();
    if (typeof api.connect === 'function') {
      const result = await api.connect();
      const publicKey = result?.publicKey ?? result?.address ?? result;
      if (!publicKey || typeof publicKey !== 'string') {
        throw new Error('Lobstr did not return a wallet address.');
      }
      return publicKey;
    }
    if (typeof api.getPublicKey === 'function') {
      const publicKey = await api.getPublicKey();
      if (!publicKey) throw new Error('Lobstr did not return a wallet address.');
      return publicKey;
    }
    throw new Error('Lobstr extension API is not compatible with this version of Trivela.');
  }

  async disconnect() {
    return true;
  }

  async getAddress() {
    const api = this.getApi();
    if (typeof api.getPublicKey === 'function') {
      const publicKey = await api.getPublicKey();
      if (!publicKey) throw new Error('No address available. Please connect your wallet first.');
      return publicKey;
    }
    if (typeof api.connect === 'function') {
      return this.connect();
    }
    throw new Error('Lobstr extension API is not compatible with this version of Trivela.');
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();
    if (typeof api.signTransaction === 'function') {
      const result = await api.signTransaction(xdr, { networkPassphrase: options.networkPassphrase });
      const signed = result?.signedTxXdr ?? result?.xdr ?? result;
      if (!signed || typeof signed !== 'string') {
        throw new Error('Lobstr did not return a signed transaction.');
      }
      return signed;
    }
    if (typeof api.sign === 'function') {
      const result = await api.sign(xdr, options.networkPassphrase);
      const signed = result?.xdr ?? result;
      if (!signed || typeof signed !== 'string') {
        throw new Error('Lobstr did not return a signed transaction.');
      }
      return signed;
    }
    throw new Error('Lobstr extension does not support transaction signing.');
  }
}
