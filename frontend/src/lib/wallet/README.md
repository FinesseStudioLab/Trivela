# Wallet Abstraction Layer

A pluggable wallet abstraction layer for Stellar that decouples the UI from specific wallet implementations.

## Architecture

The wallet abstraction consists of three main components:

1. **WalletProvider** - Abstract base class defining the wallet interface
2. **FreighterProvider** - Freighter wallet implementation
3. **WalletManager** - Manages multiple wallet providers and handles connections

## Usage

### Basic Connection

```javascript
import { walletManager } from './lib/wallet';

// Connect to Freighter
const { address, provider } = await walletManager.connect('Freighter');
console.log(`Connected to ${provider}: ${address}`);

// Get current address
const address = await walletManager.getAddress();

// Check connection status
const isConnected = await walletManager.isConnected();

// Disconnect
await walletManager.disconnect();
```

### Signing Transactions

```javascript
import { walletManager } from './lib/wallet';
import { getNetworkPassphrase } from './config';

// Sign a transaction
const signedXdr = await walletManager.signTransaction(transactionXdr, {
  networkPassphrase: getNetworkPassphrase(),
  address: walletAddress,
});
```

### Discovering Available Wallets

```javascript
import { walletManager } from './lib/wallet';

// Get list of available wallet providers
const wallets = await walletManager.getAvailableProviders();

wallets.forEach(({ name, provider }) => {
  console.log(`${name} is available`);
});
```

### Using the Convenience API

The `stellar.js` module exports convenience functions that use the wallet manager:

```javascript
import {
  connectWallet,
  disconnectWallet,
  getWalletAddress,
  isWalletConnected,
  getAvailableWallets,
  getActiveWallet,
} from './stellar';

// Connect
await connectWallet('Freighter');

// Get address
const address = await getWalletAddress();

// Check status
const connected = await isWalletConnected();

// Get active wallet name
const activeWallet = getActiveWallet();

// Disconnect
await disconnectWallet();
```

## Adding a New Wallet Provider

To add support for a new wallet:

1. Create a new provider class extending `WalletProvider`
2. Implement all required methods
3. Register the provider with the wallet manager

### Example: Adding a Custom Wallet

```javascript
import { WalletProvider } from './WalletProvider.js';

export class CustomWalletProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'CustomWallet';
  }

  getName() {
    return this.name;
  }

  async isAvailable() {
    return !!window.customWalletApi;
  }

  async isConnected() {
    const api = window.customWalletApi;
    return api && (await api.isConnected());
  }

  async connect() {
    const api = window.customWalletApi;
    const result = await api.connect();
    return result.address;
  }

  async disconnect() {
    const api = window.customWalletApi;
    await api.disconnect();
    return true;
  }

  async getAddress() {
    const api = window.customWalletApi;
    const result = await api.getAddress();
    return result.address;
  }

  async signTransaction(xdr, options) {
    const api = window.customWalletApi;
    const result = await api.signTransaction(xdr, options);
    return result.signedXdr;
  }
}
```

### Register the Provider

```javascript
import { walletManager } from './lib/wallet';
import { CustomWalletProvider } from './CustomWalletProvider';

walletManager.registerProvider(new CustomWalletProvider());
```

## API Reference

### WalletProvider (Abstract)

Base class for all wallet providers.

#### Methods

- `getName()` - Returns the wallet name
- `isAvailable()` - Checks if the wallet is available in the browser
- `isConnected()` - Checks if the wallet is currently connected
- `connect()` - Connects to the wallet and returns the address
- `disconnect()` - Disconnects from the wallet
- `getAddress()` - Gets the current wallet address
- `signTransaction(xdr, options)` - Signs a transaction XDR

### WalletManager

Manages multiple wallet providers.

#### Methods

- `registerProvider(provider)` - Registers a new wallet provider
- `getProvider(name)` - Gets a provider by name
- `getAvailableProviders()` - Returns list of available providers
- `connect(providerName)` - Connects to a specific wallet
- `disconnect()` - Disconnects from the current wallet
- `getAddress()` - Gets the connected wallet address
- `signTransaction(xdr, options)` - Signs a transaction with the active wallet
- `isConnected()` - Checks if a wallet is connected
- `getActiveProviderName()` - Gets the name of the active provider

### FreighterProvider

Freighter wallet implementation.

Implements all `WalletProvider` methods for the Freighter browser extension.

## Migration Guide

### From Direct Freighter Usage

**Before:**

```javascript
const freighterApi = window.freighterApi;
const result = await freighterApi.requestAccess();
const address = result.address;
```

**After:**

```javascript
import { connectWallet } from './stellar';
const { address } = await connectWallet('Freighter');
```

### Transaction Signing

**Before:**

```javascript
const freighterApi = window.freighterApi;
const signResult = await freighterApi.signTransaction(xdr, options);
const signedXdr = signResult.signedTxXdr;
```

**After:**

```javascript
import { walletManager } from './lib/wallet';
const signedXdr = await walletManager.signTransaction(xdr, options);
```

## Benefits

1. **Decoupling** - UI components don't depend on specific wallet implementations
2. **Extensibility** - Easy to add new wallet providers
3. **Testability** - Mock wallet providers for testing
4. **Consistency** - Uniform API across different wallets
5. **Future-proof** - Adding new wallets doesn't require UI changes
