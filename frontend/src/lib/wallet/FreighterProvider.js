import { WalletProvider } from './WalletProvider.js';

export class FreighterProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Freighter';
  }

  getName() {
    return this.name;
  }

  getApi() {
    if (!window.freighterApi) {
      throw new Error(
        'Freighter API is unavailable. Install or unlock the Freighter browser extension.',
      );
    }
    return window.freighterApi;
  }

  async isAvailable() {
    try {
      return !!window.freighterApi;
    } catch {
      return false;
    }
  }

  async isConnected() {
    try {
      const api = this.getApi();
      const status = await api.isConnected();
      if (status.error) {
        return false;
      }
      return status.isConnected;
    } catch {
      return false;
    }
  }

  async connect() {
    const api = this.getApi();

    const status = await api.isConnected();
    if (status.error) {
      throw new Error(status.error);
    }

    if (!status.isConnected) {
      throw new Error(
        'Freighter extension was not detected. Install or unlock Freighter to connect a wallet.',
      );
    }

    const existingAddress = await api.getAddress();
    if (existingAddress.error) {
      throw new Error(existingAddress.error);
    }

    if (existingAddress.address) {
      return existingAddress.address;
    }

    const access = await api.requestAccess();
    if (access.error) {
      throw new Error(access.error);
    }

    if (!access.address) {
      throw new Error('Freighter did not return a wallet address.');
    }

    return access.address;
  }

  async disconnect() {
    return true;
  }

  async getAddress() {
    const api = this.getApi();

    const result = await api.getAddress();
    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.address) {
      throw new Error('No address available. Please connect your wallet first.');
    }

    return result.address;
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();

    const result = await api.signTransaction(xdr, {
      networkPassphrase: options.networkPassphrase,
      address: options.address,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.signedTxXdr) {
      throw new Error('Freighter did not return a signed transaction.');
    }

    return result.signedTxXdr;
  }
}
