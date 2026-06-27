import { WalletManager } from './WalletManager.js';
import { FreighterProvider } from './FreighterProvider.js';
import { XBullProvider } from './XBullProvider.js';
import { RabetProvider } from './RabetProvider.js';
import { LobstrProvider } from './LobstrProvider.js';
import { WalletConnectProvider } from './WalletConnectProvider.js';
import { PasskeyProvider } from './PasskeyProvider.js';

const walletManager = new WalletManager();

walletManager.registerProvider(new FreighterProvider());
walletManager.registerProvider(new XBullProvider());
walletManager.registerProvider(new RabetProvider());
walletManager.registerProvider(new LobstrProvider());
walletManager.registerProvider(new WalletConnectProvider());
walletManager.registerProvider(new PasskeyProvider());

export {
  walletManager,
  WalletManager,
  FreighterProvider,
  XBullProvider,
  RabetProvider,
  LobstrProvider,
  WalletConnectProvider,
  PasskeyProvider,
};
export { WalletProvider } from './WalletProvider.js';
