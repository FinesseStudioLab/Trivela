import { WalletProvider } from './WalletProvider.js';

const LEDGER_STELLAR_PATH = "44'/148'/0'";

async function importTransport() {
  const mod = await import('@ledgerhq/hw-transport-webusb').catch(() => {
    throw new Error(
      'Ledger transport library is not installed. Run: npm install @ledgerhq/hw-transport-webusb @ledgerhq/hw-app-stellar',
    );
  });
  return mod.default ?? mod;
}

async function importStellarApp() {
  const mod = await import('@ledgerhq/hw-app-stellar').catch(() => {
    throw new Error('Ledger Stellar app library is not installed.');
  });
  return mod.default ?? mod;
}

export class LedgerProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Ledger';
    this._transport = null;
    this._address = null;
  }

  getName() {
    return this.name;
  }

  async isAvailable() {
    try {
      return typeof navigator !== 'undefined' && !!navigator.usb;
    } catch {
      return false;
    }
  }

  async isConnected() {
    return !!this._transport && !!this._address;
  }

  async connect() {
    if (!(await this.isAvailable())) {
      throw new Error(
        'WebUSB is not supported in this browser. Use Chrome or Edge to connect a Ledger device.',
      );
    }

    const TransportWebUSB = await importTransport();
    this._transport = await TransportWebUSB.create();

    const Stellar = await importStellarApp();
    const stellarApp = new Stellar(this._transport);

    const { publicKey } = await stellarApp.getPublicKey(LEDGER_STELLAR_PATH);
    if (!publicKey) {
      throw new Error(
        'Ledger did not return a public key. Ensure the Stellar app is open on your device.',
      );
    }

    this._address = publicKey;
    return publicKey;
  }

  async disconnect() {
    if (this._transport) {
      await this._transport.close().catch(() => {});
      this._transport = null;
    }
    this._address = null;
    return true;
  }

  async getAddress() {
    if (!this._address) {
      throw new Error('Ledger not connected. Call connect() first.');
    }
    return this._address;
  }

  async signTransaction(xdr, options = {}) {
    if (!this._transport || !this._address) {
      throw new Error('Ledger not connected. Call connect() first.');
    }

    const {
      Transaction,
      Networks,
      Keypair,
      xdr: stellarXdr,
    } = await import('@stellar/stellar-sdk');
    const Stellar = await importStellarApp();

    const network = options.networkPassphrase ?? Networks.PUBLIC;
    const tx = new Transaction(xdr, network);

    const stellarApp = new Stellar(this._transport);
    const { signature } = await stellarApp.signTransaction(LEDGER_STELLAR_PATH, tx.hash());

    if (!signature) {
      throw new Error(
        'Ledger did not return a signature. Ensure you approved the transaction on the device.',
      );
    }

    const keyPair = Keypair.fromPublicKey(this._address);
    const hint = keyPair.rawPublicKey().slice(-4);
    const decoratedSig = new stellarXdr.DecoratedSignature({ hint, signature });
    tx.signatures.push(decoratedSig);

    return tx.toEnvelope().toXDR('base64');
  }
}
