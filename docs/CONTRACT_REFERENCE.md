# Contract Function Reference

This directory contains auto-generated documentation for all public contract functions, derived
directly from Rust doc comments in the source code.

## Generating the Reference

The reference is automatically generated in CI on every pull request and available as a workflow
artifact. To generate locally:

```bash
npm run docs:contracts
```

This will:

1. Generate rustdoc HTML for `trivela-rewards-contract` and `trivela-campaign-contract`
2. Copy the output to `docs/contract-api/`
3. Include all public functions with their doc comments, parameters, and return types

To open the generated docs in your browser:

```bash
npm run docs:contracts:open
```

## Coverage

The reference covers:

### Rewards Contract (`trivela-rewards-contract`)

**Core Functions:**

- `initialize` - Initialize the rewards contract
- `credit` - Credit points to a user
- `claim` - Claim rewards (reduces balance)
- `balance` - Get user's points balance
- `total_claimed` - Get total claimed rewards
- `total_supply` - Get total points in circulation

**Advanced Features:**

- `credit_vested` - Credit linearly-vesting points
- `claim_vested` - Claim from unlocked vesting schedule
- `vested_balance` - Get unlocked but unclaimed vested balance
- `redeem` - Redeem points for asset tokens
- `pay_referral_bonus` - Pay referrer bonus for referee action

**Admin Functions:**

- `set_paused` - Pause/unpause the contract (multisig-enabled)
- `set_max_credit_per_call` - Set per-call credit limit
- `set_campaign_multiplier` - Set campaign-specific multiplier
- `set_credit_rate_limit` - Configure rate limiting
- `snapshot` - Record ledger number for off-chain indexing
- `upgrade` - In-place WASM upgrade
- `migrate` - Storage schema migration

**SEP-41 Token Interface:**

- `sep41_balance` - Get balance as i128
- `sep41_transfer` - Transfer tokens
- `sep41_approve` - Set allowance
- `sep41_allowance` - Get allowance

### Campaign Contract (`trivela-campaign-contract`)

Covers campaign management, participant registration, and campaign lifecycle functions.

## CI Integration

The contract reference is:

- ✅ Generated automatically on every PR
- ✅ Validated for documentation completeness (no missing doc comments)
- ✅ Available as a workflow artifact with 30-day retention
- ✅ Ready for publishing to the docs site

## Publishing to Docs Site

The generated documentation is committed to the repository at `docs/contract-api/`. To update it:

```bash
npm run docs:contracts
git add docs/contract-api/
git commit -m "docs: update contract function reference"
```

Alternatively, download the `contract-reference-docs` artifact from any CI run and extract to
`docs/contract-api/`.

## Format

The reference is generated as HTML using rustdoc, with:

- **Function signatures** with parameter types and return values
- **Doc comment** explanations from source code
- **Cross-references** between related functions
- **Error types** and their meanings
- **Example usage** (where provided in doc comments)

## Maintenance

The reference is **always current** because it's generated directly from source code. As contract
functions are added, removed, or modified, the reference automatically reflects those changes.

## Related Documentation

- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [Stellar Networks Config](STELLAR_NETWORKS.md)
- [Contract Testing Guide](../contracts/CONTRIBUTING.md)
