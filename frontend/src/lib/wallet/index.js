import { WalletManager } from './WalletManager.js';
import { FreighterProvider } from './FreighterProvider.js';
import { XBullProvider } from './XBullProvider.js';
import { RabetProvider } from './RabetProvider.js';
import { LobstrProvider } from './LobstrProvider.js';
import { WalletConnectProvider } from './WalletConnectProvider.js';
import { PasskeyProvider } from './PasskeyProvider.js';
import { HanaProvider } from './HanaProvider.js';
import { LedgerProvider } from './LedgerProvider.js';
import { AlbedoProvider } from './AlbedoProvider.js';

const walletManager = new WalletManager();

walletManager.registerProvider(new FreighterProvider());
walletManager.registerProvider(new XBullProvider());
walletManager.registerProvider(new RabetProvider());
walletManager.registerProvider(new LobstrProvider());
walletManager.registerProvider(new WalletConnectProvider());
walletManager.registerProvider(new PasskeyProvider());
walletManager.registerProvider(new HanaProvider());
walletManager.registerProvider(new LedgerProvider());
walletManager.registerProvider(new AlbedoProvider());

export {
  walletManager,
  WalletManager,
  FreighterProvider,
  XBullProvider,
  RabetProvider,
  LobstrProvider,
  WalletConnectProvider,
  PasskeyProvider,
  HanaProvider,
  LedgerProvider,
  AlbedoProvider,
};
export { WalletProvider } from './WalletProvider.js';
