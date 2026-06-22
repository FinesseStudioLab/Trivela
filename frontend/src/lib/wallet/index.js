import { WalletManager } from './WalletManager.js';
import { FreighterProvider } from './FreighterProvider.js';
import { XBullProvider } from './XBullProvider.js';
import { RabetProvider } from './RabetProvider.js';

const walletManager = new WalletManager();

walletManager.registerProvider(new FreighterProvider());
walletManager.registerProvider(new XBullProvider());
walletManager.registerProvider(new RabetProvider());

export { walletManager, WalletManager, FreighterProvider, XBullProvider, RabetProvider };
export { WalletProvider } from './WalletProvider.js';
