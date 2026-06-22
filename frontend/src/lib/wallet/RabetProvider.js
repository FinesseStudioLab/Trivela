import { WalletProvider } from './WalletProvider.js';

export class RabetProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Rabet';
  }

  getName() {
    return this.name;
  }

  getApi() {
    if (!window.rabet) {
      throw new Error('Rabet API is unavailable. Install or unlock the Rabet browser extension.');
    }
    return window.rabet;
  }

  async isAvailable() {
    try {
      return !!window.rabet;
    } catch {
      return false;
    }
  }

  async isConnected() {
    try {
      return !!window.rabet;
    } catch {
      return false;
    }
  }

  async connect() {
    const api = this.getApi();
    const result = await api.connect();
    if (!result?.publicKey) {
      throw new Error('Rabet did not return a wallet address.');
    }
    return result.publicKey;
  }

  async disconnect() {
    return true;
  }

  async getAddress() {
    const api = this.getApi();
    const result = await api.connect();
    if (!result?.publicKey) {
      throw new Error('No address available. Please connect your wallet first.');
    }
    return result.publicKey;
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();
    const result = await api.sign(xdr, options.networkPassphrase);
    if (!result?.xdr) {
      throw new Error('Rabet did not return a signed transaction.');
    }
    return result.xdr;
  }
}
