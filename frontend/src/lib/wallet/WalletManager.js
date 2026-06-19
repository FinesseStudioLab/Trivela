export class WalletManager {
  constructor() {
    this.providers = new Map();
    this.activeProvider = null;
    this.connectedAddress = null;
  }

  registerProvider(provider) {
    if (!provider || typeof provider.getName !== 'function') {
      throw new Error('Invalid provider: must implement getName()');
    }

    const name = provider.getName();
    this.providers.set(name, provider);
  }

  getProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Wallet provider "${name}" not found`);
    }
    return provider;
  }

  async getAvailableProviders() {
    const available = [];

    for (const [name, provider] of this.providers.entries()) {
      try {
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          available.push({
            name,
            provider,
          });
        }
      } catch (error) {
        console.warn(`Failed to check availability for ${name}:`, error);
      }
    }

    return available;
  }

  async connect(providerName) {
    const provider = this.getProvider(providerName);

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Wallet provider "${providerName}" is not available`);
    }

    const address = await provider.connect();
    this.activeProvider = provider;
    this.connectedAddress = address;

    return {
      address,
      provider: providerName,
    };
  }

  async disconnect() {
    if (!this.activeProvider) {
      return;
    }

    await this.activeProvider.disconnect();
    this.activeProvider = null;
    this.connectedAddress = null;
  }

  async getAddress() {
    if (!this.activeProvider) {
      throw new Error('No wallet connected');
    }

    if (this.connectedAddress) {
      return this.connectedAddress;
    }

    const address = await this.activeProvider.getAddress();
    this.connectedAddress = address;
    return address;
  }

  async signTransaction(xdr, options = {}) {
    if (!this.activeProvider) {
      throw new Error('No wallet connected');
    }

    return this.activeProvider.signTransaction(xdr, options);
  }

  async isConnected() {
    if (!this.activeProvider) {
      return false;
    }

    return this.activeProvider.isConnected();
  }

  getActiveProviderName() {
    return this.activeProvider ? this.activeProvider.getName() : null;
  }
}
