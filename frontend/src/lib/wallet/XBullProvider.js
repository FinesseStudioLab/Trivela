import { WalletProvider } from './WalletProvider.js';

export class XBullProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'xBull';
  }

  getName() {
    return this.name;
  }

  getApi() {
    if (!window.xBullSDK) {
      throw new Error('xBull SDK is unavailable. Install or unlock the xBull browser extension.');
    }
    return window.xBullSDK;
  }

  async isAvailable() {
    try {
      return !!window.xBullSDK;
    } catch {
      return false;
    }
  }

  async isConnected() {
    try {
      return !!window.xBullSDK;
    } catch {
      return false;
    }
  }

  async connect() {
    const api = this.getApi();
    await api.connect();
    const publicKey = await api.getPublicKey();
    if (!publicKey) {
      throw new Error('xBull did not return a wallet address.');
    }
    return publicKey;
  }

  async disconnect() {
    return true;
  }

  async getAddress() {
    const api = this.getApi();
    const publicKey = await api.getPublicKey();
    if (!publicKey) {
      throw new Error('No address available. Please connect your wallet first.');
    }
    return publicKey;
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();
    const network = options.networkPassphrase?.includes('Test SDF') ? 'TESTNET' : 'PUBLIC';
    const signedXdr = await api.signXDR(xdr, { network });
    if (!signedXdr) {
      throw new Error('xBull did not return a signed transaction.');
    }
    return signedXdr;
  }
}
