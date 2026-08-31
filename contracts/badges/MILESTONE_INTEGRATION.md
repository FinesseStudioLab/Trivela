# Badge Milestone Integration Guide

## Overview

The Trivela Badges contract mints soulbound (SBT) or transferable NFT achievement badges for
campaign milestones. This guide shows how to integrate badge minting with the rewards and campaign
contracts.

## Badge Types

The contract supports predefined milestone badge types:

- `first_claim`: First reward claim milestone
- `top_rank`: Top-N rank achievement
- `streak`: Consecutive participation streak
- `referral`: Referral milestone (e.g., 10 successful referrals)
- `custom`: Custom campaign-specific badges

## Integration Pattern

### 1. Configure Badge Minters

Only authorized minters can mint badges for each badge type. The admin configures which contracts
can mint:

```rust
// Allow rewards contract to mint first_claim badges
badges_contract.set_badge_type_minter(
    &admin,
    &symbol_short!("first_claim"),
    &rewards_contract_address
);

// Allow campaign contract to mint streak badges
badges_contract.set_badge_type_minter(
    &admin,
    &symbol_short!("streak"),
    &campaign_contract_address
);
```

### 2. Mint Badges from Authorized Contracts

#### First Claim Badge (from rewards contract)

When a user makes their first claim, mint a soulbound first_claim badge:

```rust
// In rewards contract claim() function
let claim_count = get_user_claim_count(&env, &user);
if claim_count == 1 {
    // First claim - mint badge
    let badge_client = BadgesContractClient::new(&env, &badges_contract_id);
    badge_client.mint(
        &user,
        &symbol_short!("first_claim"),
        &metadata_uri, // IPFS/S3 URI with badge metadata JSON
        &true  // soulbound = true (non-transferable)
    );
}
```

#### Top Rank Badge (from campaign contract)

Award top-N finishers at campaign end:

```rust
// In campaign contract finalize() function
let top_10_users = get_leaderboard_top_n(&env, &campaign_id, 10);
for user in top_10_users.iter() {
    badge_client.mint(
        &user,
        &symbol_short!("top_rank"),
        &rank_metadata_uri,
        &false  // transferable badge (users can trade)
    );
}
```

#### Streak Badge

Mint streak badges for consecutive participation:

```rust
// In campaign contract participation tracking
let streak_days = get_user_streak(&env, &user);
if streak_days == 7 || streak_days == 30 || streak_days == 90 {
    badge_client.mint(
        &user,
        &symbol_short!("streak"),
        &streak_metadata_uri(streak_days),
        &true  // soulbound
    );
}
```

#### Referral Milestone Badge

Award badges for successful referrals:

```rust
// In rewards contract after referral bonus payment
let referral_count: u64 = env.storage().instance()
    .get(&(REF_COUNT, referrer.clone()))
    .unwrap_or(0);

if referral_count == 10 || referral_count == 50 || referral_count == 100 {
    badge_client.mint(
        &referrer,
        &symbol_short!("referral"),
        &referral_metadata_uri(referral_count),
        &true  // soulbound
    );
}
```

## Badge Metadata Format

Metadata URIs should point to JSON following this schema:

```json
{
  "name": "First Claim Pioneer",
  "description": "Awarded for making your first reward claim",
  "image": "https://ipfs.io/ipfs/QmXxx...",
  "attributes": [
    {
      "trait_type": "Milestone",
      "value": "First Claim"
    },
    {
      "trait_type": "Rarity",
      "value": "Common"
    },
    {
      "trait_type": "Earned Date",
      "value": "2026-08-31"
    }
  ]
}
```

## UI Integration

### Display User Badges

```rust
// Get all badge IDs for a user
let badge_ids = badges_contract.tokens_of(&user);

for badge_id in badge_ids.iter() {
    let badge_type = badges_contract.badge_type(&badge_id).unwrap();
    let metadata_uri = badges_contract.token_uri(&badge_id).unwrap();
    let is_soulbound = badges_contract.is_soulbound(&badge_id);

    // Fetch metadata from URI and display in UI
    // Show transfer button only if !is_soulbound
}
```

### Check Badge Ownership

```rust
// Check if user has earned a specific badge type
let has_first_claim = badges_contract.has_badge_type(
    &user,
    &symbol_short!("first_claim")
);

if has_first_claim {
    // Show "First Claim Pioneer" badge on profile
}
```

## Anti-Gaming Measures

### Soulbound Deduplication

The contract prevents duplicate soulbound badges of the same type per user:

```rust
// This will fail with BadgeAlreadyMinted error
badge_client.mint(&user, &symbol_short!("first_claim"), &uri, &true)?;
badge_client.mint(&user, &symbol_short!("first_claim"), &uri, &true)?; // ERROR
```

### ZK Nullifier Integration

For badges tied to on-chain actions (claims, referrals), the underlying nullifier system in the
campaign/rewards contracts already prevents sybil attacks. Badge minting inherits this protection.

## Examples

See `contracts/badges/src/test.rs` for complete working examples of:

- Minter authorization
- Badge minting for different milestone types
- Soulbound vs transferable badges
- Batch minting for campaign leaderboards

## Frontend Integration

Badge profile display:

```typescript
// Example React component
async function UserBadges({ userId }) {
  const badgeIds = await badgesContract.tokens_of(userId);
  const badges = await Promise.all(
    badgeIds.map(async (id) => ({
      id,
      type: await badgesContract.badge_type(id),
      metadata: await fetch(await badgesContract.token_uri(id)),
      soulbound: await badgesContract.is_soulbound(id)
    }))
  );

  return (
    <div className="badge-showcase">
      {badges.map(badge => (
        <BadgeCard key={badge.id} {...badge} />
      ))}
    </div>
  );
}
```
