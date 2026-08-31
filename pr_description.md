# Optimization: Merkle-based bulk credit for gas-efficient mass distribution

## Summary
This PR implements a gas-efficient Merkle-tree based distribution mechanism for mass crediting in the rewards contract. This prevents the contract from hitting storage and gas limits when crediting thousands of users simultaneously.

## Changes
- **Admin Root Publishing:** Admins can now publish a single Merkle Root representing the distribution list (user, amount) using `set_merkle_root`.
- **User Claiming (O(log n)):** Users provide their Merkle proof to the `claim_merkle` function. The contract verifies the proof against the stored root, ensuring that users can only claim their exact allocation.
- **Double-Claim Prevention:** Added a tracking mechanism mapping each successfully claimed leaf hash to a boolean to prevent double-claiming.
- **Gas Costs Shifted:** The gas cost of crediting is now correctly shifted to the end-users claiming the reward, keeping admin overhead minimal and scalable to millions of users.

## Verification
- Added a full suite of Rust tests with locally generated Merkle trees to verify valid and invalid proofs.
- Attempting to claim twice with the same valid proof properly reverts with `Error::AlreadyClaimed`.
- Gas usage analysis validates the `O(log n)` verification constraint.

## Closes
Closes #897
