import { WalletProvider } from './WalletProvider.js';

const RP_NAME = 'Trivela';
const RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export class PasskeyProvider extends WalletProvider {
  constructor() {
    super();
    this.credential = null;
    this.address = null;
  }

  getName() {
    return 'Passkey';
  }

  async isAvailable() {
    if (typeof window === 'undefined') return false;
    if (!window.PublicKeyCredential) return false;

    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch {
      return false;
    }
  }

  async connect() {
    if (!await this.isAvailable()) {
      throw new Error('WebAuthn is not available in this browser');
    }

    const existingCredential = this.loadStoredCredential();
    if (existingCredential) {
      this.credential = existingCredential;
      this.address = this.deriveAddress(existingCredential);
      return this.address;
    }

    return this.createWallet();
  }

  async createWallet() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: RP_NAME,
          id: RP_ID,
        },
        user: {
          id: userId,
          name: `trivela-user-${Date.now()}`,
          displayName: 'Trivela User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    });

    this.credential = credential;
    this.address = this.deriveAddress(credential);
    this.storeCredential(credential);

    return this.address;
  }

  async disconnect() {
    this.credential = null;
    this.address = null;
    this.clearStoredCredential();
  }

  async getAddress() {
    if (!this.address) {
      throw new Error('No wallet connected');
    }
    return this.address;
  }

  async signTransaction(xdr, options = {}) {
    if (!this.credential) {
      throw new Error('No wallet connected');
    }

    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: RP_ID,
        allowCredentials: [
          {
            id: this.credential.rawId,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return {
      signedXdr: xdr,
      signature: assertion.response.signature,
      authenticatorData: assertion.response.authenticatorData,
      clientDataJSON: assertion.response.clientDataJSON,
      credentialId: this.credential.rawId,
    };
  }

  async isConnected() {
    return this.credential !== null && this.address !== null;
  }

  deriveAddress(credential) {
    const data = new TextEncoder().encode(`${RP_ID}:${credential.id}`);
    const hash = crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hash);
    const addressBytes = hashArray.slice(0, 32);

    const stellarChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let address = 'G';
    for (let i = 0; i < 56; i++) {
      const byteIndex = Math.floor((i * 5) / 8);
      const bitOffset = (i * 5) % 8;
      const byte = addressBytes[byteIndex] || 0;
      const nextByte = addressBytes[byteIndex + 1] || 0;
      const value = ((byte << 8) | nextByte) >> (11 - bitOffset) & 0x1f;
      address += stellarChars[value] || 'A';
    }
    return address;
  }

  storeCredential(credential) {
    try {
      const data = {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
      };
      localStorage.setItem('trivela_passkey', JSON.stringify(data));
    } catch {
      // Storage not available
    }
  }

  loadStoredCredential() {
    try {
      const data = localStorage.getItem('trivela_passkey');
      if (!data) return null;
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        rawId: new Uint8Array(parsed.rawId).buffer,
      };
    } catch {
      return null;
    }
  }

  clearStoredCredential() {
    try {
      localStorage.removeItem('trivela_passkey');
    } catch {
      // Ignore
    }
  }
}
