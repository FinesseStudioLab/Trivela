# Participant Registry Pagination Design

## Problem Statement

The current `PARTICIPANT_REGISTRY` implementation stores all participant addresses in a single `Vec<Address>` in instance storage. This causes the contract to fail when the registry exceeds the Soroban ledger entry size limit (~64KB).

**Impact:** Campaigns can silently cap out after reaching approximately 1,000-2,000 participants (depending on address sizes), making registration revert for all subsequent users.

## Proposed Solution: Paginated Persistent Storage

Replace the monolithic vector with a paginated scheme that distributes participants across multiple ledger entries.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Instance Storage                     │
│                                                         │
│  PART_COUNT: u32    (total participant count)          │
│  PART_PAGES: u32    (number of pages allocated)        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  Persistent Storage                     │
│                                                         │
│  (PART_PAGE, 0): Vec<Address>  [max 100 entries]       │
│  (PART_PAGE, 1): Vec<Address>  [max 100 entries]       │
│  (PART_PAGE, 2): Vec<Address>  [max 100 entries]       │
│  ...                                                    │
│  (PART_PAGE, N): Vec<Address>  [max 100 entries]       │
└─────────────────────────────────────────────────────────┘
```

### Storage Keys

```rust
use soroban_sdk::contracttype;

#[contracttype]
pub enum DataKey {
    // Metadata in instance storage (small, frequently accessed)
    ParticipantCount,
    ParticipantPages,
    
    // Paginated data in persistent storage
    ParticipantPage(u32),
}
```

### Constants

```rust
/// Maximum participants per page (keeps page size under 32KB)
const PARTICIPANTS_PER_PAGE: u32 = 100;

/// Maximum total participants (safety limit)
const MAX_TOTAL_PARTICIPANTS: u32 = 50_000;
```

### Core Operations

#### 1. Register Participant

```rust
pub fn register(env: Env, participant: Address) -> Result<(), ContractError> {
    participant.require_auth();
    
    // Check if already registered (scan all pages)
    if is_participant_registered(&env, &participant)? {
        return Err(ContractError::AlreadyRegistered);
    }
    
    // Get current count
    let count: u32 = env.storage()
        .instance()
        .get(&DataKey::ParticipantCount)
        .unwrap_or(0);
    
    // Check max limit
    if count >= MAX_TOTAL_PARTICIPANTS {
        return Err(ContractError::RegistrationClosed);
    }
    
    // Calculate which page to append to
    let page_index = count / PARTICIPANTS_PER_PAGE;
    let page_key = DataKey::ParticipantPage(page_index);
    
    // Get or create page
    let mut page: Vec<Address> = env.storage()
        .persistent()
        .get(&page_key)
        .unwrap_or(Vec::new(&env));
    
    // Append participant
    page.push_back(participant.clone());
    
    // Save page
    env.storage().persistent().set(&page_key, &page);
    
    // Increment count
    env.storage()
        .instance()
        .set(&DataKey::ParticipantCount, &(count + 1));
    
    // Update page count if new page
    if count % PARTICIPANTS_PER_PAGE == 0 {
        let pages = (count / PARTICIPANTS_PER_PAGE) + 1;
        env.storage()
            .instance()
            .set(&DataKey::ParticipantPages, &pages);
    }
    
    // Emit event
    env.events().publish(
        (symbol_short!("REGISTER"),),
        (participant, count + 1)
    );
    
    Ok(())
}
```

#### 2. Check if Participant Registered

```rust
fn is_participant_registered(env: &Env, participant: &Address) -> Result<bool, ContractError> {
    let count: u32 = env.storage()
        .instance()
        .get(&DataKey::ParticipantCount)
        .unwrap_or(0);
    
    let num_pages = (count + PARTICIPANTS_PER_PAGE - 1) / PARTICIPANTS_PER_PAGE;
    
    for page_index in 0..num_pages {
        let page_key = DataKey::ParticipantPage(page_index);
        
        if let Some(page) = env.storage().persistent().get::<_, Vec<Address>>(&page_key) {
            for addr in page.iter() {
                if addr == *participant {
                    return Ok(true);
                }
            }
        }
    }
    
    Ok(false)
}
```

#### 3. Get Participants (Paginated)

```rust
pub fn get_participants_page(
    env: Env,
    page: u32,
    page_size: u32
) -> Result<Vec<Address>, ContractError> {
    // Validate page size
    if page_size == 0 || page_size > PARTICIPANTS_PER_PAGE {
        return Err(ContractError::InvalidPageSize);
    }
    
    let page_key = DataKey::ParticipantPage(page);
    
    let full_page: Vec<Address> = env.storage()
        .persistent()
        .get(&page_key)
        .unwrap_or(Vec::new(&env));
    
    // If requesting smaller page size, slice accordingly
    if page_size < PARTICIPANTS_PER_PAGE {
        let end = full_page.len().min(page_size as usize);
        let mut result = Vec::new(&env);
        for i in 0..end {
            result.push_back(full_page.get(i).unwrap());
        }
        Ok(result)
    } else {
        Ok(full_page)
    }
}
```

#### 4. Get Total Participant Count

```rust
pub fn get_participant_count(env: Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ParticipantCount)
        .unwrap_or(0)
}
```

### Migration Strategy

#### Phase 1: Add New Storage System (Non-Breaking)

1. Deploy contract with new paginated storage functions
2. Keep old `PARTICIPANT_REGISTRY` intact
3. New registrations go to paginated storage
4. Read operations check both old and new storage

#### Phase 2: Background Migration

Run off-chain script to migrate existing participants:

```rust
// Admin-only migration function
pub fn migrate_participants_batch(
    env: Env,
    admin: Address,
    start_index: u32,
    count: u32
) -> Result<u32, ContractError> {
    admin.require_auth();
    
    // Read from old storage
    let old_registry: Vec<Address> = env.storage()
        .instance()
        .get(&symbol_short!("OLD_REG"))
        .unwrap_or(Vec::new(&env));
    
    let end_index = (start_index + count).min(old_registry.len());
    let mut migrated = 0;
    
    for i in start_index..end_index {
        if let Some(participant) = old_registry.get(i) {
            // Add to new paginated storage (without auth check)
            internal_add_participant(&env, participant)?;
            migrated += 1;
        }
    }
    
    Ok(migrated)
}
```

#### Phase 3: Deprecate Old Storage

1. Verify all participants migrated
2. Remove old storage reads
3. Clean up old storage entry

### Alternative: Event-Based Indexing

If on-chain enumeration is not critical, consider **removing the on-chain registry entirely** and relying on emitted events + off-chain indexer:

**Pros:**
- Zero storage growth
- No pagination complexity
- Unlimited participants
- Gas savings

**Cons:**
- Cannot enumerate participants on-chain
- Requires reliable off-chain indexer
- Historical queries depend on event retention

**Implementation:**

```rust
pub fn register(env: Env, participant: Address) -> Result<(), ContractError> {
    participant.require_auth();
    
    // Check individual participant flag (still in persistent storage)
    let participant_key = DataKey::Participant(participant.clone());
    if env.storage().persistent().has(&participant_key) {
        return Err(ContractError::AlreadyRegistered);
    }
    
    // Set participant flag
    env.storage().persistent().set(&participant_key, &true);
    
    // Increment counter
    let count: u32 = env.storage()
        .instance()
        .get(&DataKey::ParticipantCount)
        .unwrap_or(0);
    
    env.storage()
        .instance()
        .set(&DataKey::ParticipantCount, &(count + 1));
    
    // Emit event for off-chain indexing
    env.events().publish(
        (symbol_short!("REGISTER"),),
        (participant.clone(), count + 1, env.ledger().timestamp())
    );
    
    Ok(())
}

// Off-chain: listen to REGISTER events and build participant list
```

## Recommendation

**Use paginated persistent storage** if:
- On-chain enumeration is required
- Contract needs to read full participant list
- Admin operations need participant iteration

**Use event-based indexing** if:
- Only off-chain systems need participant lists
- Storage costs are a concern
- Participant count could exceed 50K

For Trivela's use case (campaigns with potential millions of participants), **event-based indexing is recommended** as the long-term solution, with paginated storage as an intermediate step.

## Testing Requirements

### Unit Tests

```rust
#[test]
fn test_register_50k_participants() {
    // Verify no storage limit failures
}

#[test]
fn test_pagination_boundary_conditions() {
    // Test exact page boundaries
}

#[test]
fn test_duplicate_registration_across_pages() {
    // Ensure check works across all pages
}
```

### Integration Tests

- Register 10,000 participants in testnet
- Verify all pages accessible
- Measure gas costs per page
- Test concurrent registrations

### Load Tests

- Simulate 50,000 registrations
- Measure performance degradation
- Verify no ledger entry size errors

## Rollout Plan

1. **Week 1:** Implement paginated storage + tests
2. **Week 2:** Deploy to testnet, run load tests
3. **Week 3:** Deploy migration script, migrate existing campaigns
4. **Week 4:** Deploy to mainnet with feature flag
5. **Week 5:** Enable for all campaigns, monitor metrics

## Metrics to Track

- Participants per campaign
- Registration gas costs
- Page access latency
- Storage costs per campaign
- Failed registrations (should be zero)

## References

- [Soroban Storage Documentation](https://soroban.stellar.org/docs/learn/storage)
- [Ledger Entry Size Limits](https://soroban.stellar.org/docs/reference/resource-limits)
- [Event Indexing Best Practices](https://soroban.stellar.org/docs/learn/events)
