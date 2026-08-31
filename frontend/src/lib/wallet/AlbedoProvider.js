import { WalletProvider } from './WalletProvider.js';

export class AlbedoProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Albedo';
    this._connectedPubkey = null;
  }

  getName() {
    return this.name;
  }

  getApi() {
    if (typeof window === 'undefined' || !window.albedo) {
      throw new Error(
        'Albedo is not available. Open https://albedo.link to use web-based signing.',
      );
    }
    return window.albedo;
  }

  async isAvailable() {
    try {
      return typeof window !== 'undefined' && !!window.albedo;
    } catch {
      return false;
    }
  }

  async isConnected() {
    return !!this._connectedPubkey;
  }

  async connect() {
    const api = this.getApi();
    try {
      const result = await api.publicKey({});
      if (!result?.pubkey) {
        throw new Error('Albedo did not return a public key.');
      }
      this._connectedPubkey = result.pubkey;
      return result.pubkey;
    } catch (err) {
      if (err.message?.includes('User rejected') || err.code === 'user_rejected') {
        throw new Error('Albedo connection was rejected by the user.');
      }
      throw err;
    }
  }

  async disconnect() {
    this._connectedPubkey = null;
    return true;
  }

  async getAddress() {
    if (this._connectedPubkey) return this._connectedPubkey;
    return this.connect();
  }

  async signTransaction(xdr, options = {}) {
    const api = this.getApi();
    try {
      const result = await api.signTransaction({
        xdr,
        pubkey: this._connectedPubkey ?? undefined,
        network_passphrase: options.networkPassphrase,
      });
      const signed = result?.signed_envelope_xdr ?? result?.xdr;
      if (!signed) {
        throw new Error('Albedo did not return a signed transaction.');
      }
      return signed;
    } catch (err) {
      if (err.message?.includes('User rejected') || err.code === 'user_rejected') {
        throw new Error('Transaction signing was rejected by the user.');
      }
      throw err;
    }
  }
}
