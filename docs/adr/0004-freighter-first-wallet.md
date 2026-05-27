# ADR-004: Freighter as the primary wallet integration

**Status:** Accepted  
**Date:** 2024-12-01

## Context

The Trivela frontend needs a way for users to sign Soroban transactions from
the browser. Options considered: Freighter browser extension, WalletConnect
(Stellar variant), xBull Wallet, LOBSTR, hardware wallet (Ledger via Stellar
SDK), or bringing our own key management (custodial).

## Decision

Integrate **Freighter** as the first-class, primary wallet via
`@stellar/freighter-api`.

## Reasons

1. **Stellar Wave alignment** — Freighter is the SDF-maintained reference
   wallet for Soroban dApps and is the integration example in all Soroban
   developer guides.
2. **`@stellar/freighter-api`** — provides a typed, promise-based API:
   `isConnected()`, `getPublicKey()`, `signTransaction()`. No custom
   transaction serialization needed beyond the standard SDK XDR.
3. **Soroban-native** — Freighter correctly handles Soroban footprint
   simulation, resource fees, and the `AUTH_REQUIRED` flag; generic
   WalletConnect adapters lagged behind on Soroban support at the time of
   this decision.
4. **User familiarity** — Stellar/Soroban users already have Freighter
   installed for other dApps; reducing setup friction increases conversion.

## Consequences

- **Positive:** Fastest path to a working sign-and-submit flow in the browser.
- **Positive:** SDF keeps Freighter updated with new Soroban protocol versions;
  we get protocol upgrades "for free."
- **Negative:** Freighter is a browser extension; mobile users and users on
  locked-down environments cannot use it without additional wallet support.
- **Negative:** If a user does not have Freighter installed, the UI must detect
  `window.freighter === undefined` and show an install prompt — there is no
  in-app fallback key management.
- **Negative:** Only one wallet deep-linked; contributors wanting to add
  WalletConnect or xBull must implement a wallet-adapter abstraction layer
  first (see open issue for multi-wallet support).

## Future

Abstract wallet interactions behind a `WalletProvider` interface so Freighter,
xBull, and WalletConnect can be plugged in without changing call sites. Update
this ADR when a second wallet is formally supported.
