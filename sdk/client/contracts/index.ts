/**
 * Trivela Smart Contract TypeScript Bindings
 * 
 * This module provides TypeScript bindings for Trivela's Soroban smart contracts.
 * Bindings are generated from compiled WASM files using stellar-cli.
 * 
 * To generate bindings, run: npm run generate:contracts
 * 
 * Note: Contract bindings will be auto-generated when WASM files are available.
 * Build contracts first: cargo build --release --target wasm32-unknown-unknown
 * 
 * Issue #878: TypeScript SDK with contract bindings
 */

// Placeholder types until bindings are generated
export interface ContractClient {
  contractId: string;
  rpcUrl: string;
}

// Export contract clients (will be replaced by generated code)
// export * from './rewards';
// export * from './campaign';

console.warn(
  '@trivela/client/contracts: Bindings not yet generated. Run `npm run generate:contracts` after building the Soroban contracts.'
);
