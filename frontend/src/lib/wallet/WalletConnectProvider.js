import { WalletProvider } from './WalletProvider.js';

/**
 * WalletConnect provider stub.
 *
 * Full WalletConnect (Sign Client v2) requires a project ID registered at
 * cloud.walletconnect.com and is initialised asynchronously. This provider
 * detects whether the environment is configured and connects via the
 * existing WalletConnect client if one was injected into window by the app
 * bootstrap (e.g. via @walletconnect/sign-client). Without a client the
 * provider throws a clear, user-facing error so the wallet modal can surface
 * a helpful install/configure link rather than a cryptic stack trace.
 */
export class WalletConnectProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'WalletConnect';
    this._address = null;
  }

  getName() {
    return this.name;
  }

  _getClient() {
    return window.__walletConnectClient ?? null;
  }

  async isAvailable() {
    return this._getClient() !== null;
  }

  async isConnected() {
    try {
      const client = this._getClient();
      if (!client) return false;
      const sessions = client.session?.getAll?.() ?? [];
      return sessions.length > 0;
    } catch {
      return false;
    }
  }

  async connect() {
    const client = this._getClient();
    if (!client) {
      throw new Error(
        'WalletConnect is not configured. Set up a WalletConnect project ID and initialise the Sign Client to enable QR-code wallet connections.',
      );
    }

    const { uri, approval } = await client.connect({
      requiredNamespaces: {
        stellar: {
          methods: ['stellar_signTransaction'],
          chains: ['stellar:pubnet', 'stellar:testnet'],
          events: ['accountsChanged'],
        },
      },
    });

    if (uri && typeof window.open === 'function') {
      window.open(uri, '_blank', 'noopener,noreferrer');
    }

    const session = await approval();
    const account = session.namespaces?.stellar?.accounts?.[0] ?? '';
    const address = account.split(':').pop();
    if (!address) throw new Error('WalletConnect session did not provide a Stellar address.');
    this._address = address;
    return address;
  }

  async disconnect() {
    const client = this._getClient();
    if (!client) return true;
    try {
      const sessions = client.session?.getAll?.() ?? [];
      for (const session of sessions) {
        await client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'User disconnected' } });
      }
    } catch {
      // best-effort
    }
    this._address = null;
    return true;
  }

  async getAddress() {
    if (this._address) return this._address;
    throw new Error('No WalletConnect session active. Please connect first.');
  }

  async signTransaction(xdr, options = {}) {
    const client = this._getClient();
    if (!client) throw new Error('WalletConnect is not configured.');

    const sessions = client.session?.getAll?.() ?? [];
    if (sessions.length === 0) throw new Error('No active WalletConnect session.');

    const session = sessions[0];
    const chainId = options.networkPassphrase?.includes('Test SDF')
      ? 'stellar:testnet'
      : 'stellar:pubnet';

    const result = await client.request({
      topic: session.topic,
      chainId,
      request: { method: 'stellar_signTransaction', params: { xdr } },
    });

    const signed = result?.signedTxXdr ?? result?.xdr ?? result;
    if (!signed || typeof signed !== 'string') {
      throw new Error('WalletConnect did not return a signed transaction.');
    }
    return signed;
  }
}
