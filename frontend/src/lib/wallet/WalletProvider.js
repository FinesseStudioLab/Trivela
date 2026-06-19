export class WalletProvider {
  constructor() {
    if (new.target === WalletProvider) {
      throw new TypeError('Cannot construct WalletProvider instances directly');
    }
  }

  async isAvailable() {
    throw new Error('isAvailable() must be implemented');
  }

  async connect() {
    throw new Error('connect() must be implemented');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented');
  }

  async getAddress() {
    throw new Error('getAddress() must be implemented');
  }

  async signTransaction(xdr, options) {
    throw new Error('signTransaction() must be implemented');
  }

  async isConnected() {
    throw new Error('isConnected() must be implemented');
  }

  getName() {
    throw new Error('getName() must be implemented');
  }
}
