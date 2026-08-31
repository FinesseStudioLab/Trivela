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
      throw new Error(
        'Rabet is not installed. Please install the Rabet browser extension from https://rabet.io and reload the page.',
      );
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
      throw new Error('No address available. Please connect your Rabet wallet first.');
    }
    return result.publicKey;
  }

  async getNetwork() {
    const api = this.getApi();
    // Rabet's connect() response includes the active network passphrase.
    const result = await api.connect();
    if (!result?.network) {
      throw new Error('Rabet did not return a network passphrase.');
    }
    return result.network;
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();
    const networkPassphrase = options.networkPassphrase ?? (await this.getNetwork());
    const result = await api.sign(xdr, networkPassphrase);
    if (!result?.xdr) {
      throw new Error('Rabet did not return a signed transaction.');
    }
    return result.xdr;
  }
}
