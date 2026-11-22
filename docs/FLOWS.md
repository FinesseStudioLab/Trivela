# Data Flow Diagrams

Detailed sequence diagrams for each core Trivela user journey. These complement the high-level
diagram in [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md).

---

## 1. Campaign Registration

A user connects their wallet and registers as a participant in an active campaign.

```mermaid
sequenceDiagram
    actor User as User Wallet
    participant FE as Frontend (React)
    participant BE as Backend API
    participant RPC as Soroban RPC
    participant CC as Campaign Contract

    User->>FE: Connect wallet (Freighter)
    FE->>BE: GET /api/v1/campaigns/:id
    BE-->>FE: Campaign metadata (start, end, merkle_root)
    FE->>FE: Check campaign window (client hint)
    User->>FE: Click "Register"
    FE->>RPC: simulateTransaction (campaign.register)
    RPC-->>FE: Fee estimate + footprint
    FE->>User: Sign transaction prompt
    User-->>FE: Signed XDR
    FE->>RPC: sendTransaction (signed XDR)
    RPC->>CC: register(user, leaf, proof)
    CC->>CC: Verify time window
    CC->>CC: Verify merkle proof
    CC->>CC: Store participant, emit "register" event
    CC-->>RPC: Ok(true)
    RPC-->>FE: txHash + status
    FE-->>User: "Registered!" confirmation
```

---

## 2. Claim Rewards

A registered user claims part of their accrued points balance.

```mermaid
sequenceDiagram
    actor User as User Wallet
    participant FE as Frontend (React)
    participant RPC as Soroban RPC
    participant RC as Rewards Contract

    User->>FE: Open "My Rewards" page
    FE->>RPC: invokeContractFunction (rewards.balance)
    RPC->>RC: balance(user)
    RC-->>RPC: current_balance: u64
    RPC-->>FE: current_balance
    FE-->>User: Display balance
    User->>FE: Enter claim amount, click "Claim"
    FE->>RPC: simulateTransaction (rewards.claim)
    RPC-->>FE: Fee estimate
    FE->>User: Sign transaction prompt
    User-->>FE: Signed XDR
    FE->>RPC: sendTransaction (signed XDR)
    RPC->>RC: claim(user, amount)
    RC->>RC: Verify user auth
    RC->>RC: Check not paused
    RC->>RC: Deduct balance, increment total_claimed
    RC->>RC: Emit "claim" event
    RC-->>RPC: Ok(new_balance)
    RPC-->>FE: txHash + status
    FE-->>User: "Claimed! New balance: X"
```

---

## 3. Admin: Set Campaign Time Window

An admin configures the open/close timestamps for campaign participation.

```mermaid
sequenceDiagram
    actor Admin as Admin Wallet
    participant FE as Frontend (Admin UI)
    participant RPC as Soroban RPC
    participant CC as Campaign Contract

    Admin->>FE: Open "Campaign Settings"
    Admin->>FE: Enter campaign_id, open_time, close_time
    FE->>RPC: simulateTransaction (campaign.set_window)
    RPC-->>FE: Fee estimate
    FE->>Admin: Sign transaction prompt
    Admin-->>FE: Signed XDR
    FE->>RPC: sendTransaction (signed XDR)
    RPC->>CC: set_window(admin, campaign_id, open_time, close_time)
    CC->>CC: require_auth(admin)
    CC->>CC: Validate admin == stored admin
    CC->>CC: Persist window, extend TTL
    CC-->>RPC: Ok(())
    RPC-->>FE: txHash + status
    FE-->>Admin: "Window saved"
```

---

## 4. Admin: Credit Rewards (Batch)

An admin credits reward points to multiple users in a single transaction (#85).

```mermaid
sequenceDiagram
    actor Admin as Admin Wallet
    participant BE as Backend / Script
    participant RPC as Soroban RPC
    participant RC as Rewards Contract

    Admin->>BE: POST /api/v1/credits  { recipients: [{user, amount}] }
    BE->>BE: Build Vec<(Address, u64)> from recipients
    BE->>RPC: simulateTransaction (rewards.batch_credit)
    RPC-->>BE: Fee estimate
    BE->>Admin: Prompt / auto-sign with admin key
    Admin-->>BE: Signed XDR
    BE->>RPC: sendTransaction (signed XDR)
    RPC->>RC: batch_credit(from, recipients)
    RC->>RC: from.require_auth()
    RC->>RC: ensure_not_paused()
    loop Stage balances (atomic)
        RC->>RC: read balance[user], checked_add(amount)
    end
    loop Commit balances
        RC->>RC: write balance[user] = new_balance
    end
    loop Emit events
        RC->>RC: emit "credit" event per user
    end
    RC-->>RPC: Ok(())
    RPC-->>BE: txHash + status
    BE-->>Admin: Credits applied
```

---

## 5. Admin: Set Max Credit Per Call

An admin sets the upper bound on points per single `credit` call to prevent runaway crediting (#83).

```mermaid
sequenceDiagram
    actor Admin as Admin Wallet
    participant FE as Frontend (Admin UI)
    participant RPC as Soroban RPC
    participant RC as Rewards Contract

    Admin->>FE: Enter max_amount (0 = unlimited)
    FE->>RPC: simulateTransaction (rewards.set_max_credit_per_call)
    RPC-->>FE: Fee estimate
    FE->>Admin: Sign transaction prompt
    Admin-->>FE: Signed XDR
    FE->>RPC: sendTransaction (signed XDR)
    RPC->>RC: set_max_credit_per_call(admin, max_amount)
    RC->>RC: require_admin(admin)
    RC->>RC: Store MAX_CREDIT_PER_CALL = max_amount
    RC->>RC: Emit "mxcredit" event
    RC-->>RPC: Ok(())
    RPC-->>FE: txHash + status
    FE-->>Admin: "Limit updated"
    note over RC: Future credit(amount > max) → Err(CreditLimitExceeded)
```

---

## 6. Referral Claim Sub-flow

A referred user completes a qualifying action (claims rewards). The backend then pays the referral
bonus to the referrer via the rewards contract. See
[REFERRAL_REWARDS.md](REFERRAL_REWARDS.md) for the full reward-engine design and anti-abuse
invariants.

### Happy path

```mermaid
sequenceDiagram
    actor Referee as Referee Wallet
    actor Referrer as Referrer Wallet
    participant FE as Frontend (React)
    participant BE as Backend (admin)
    participant RPC as Soroban RPC
    participant RC as Rewards Contract
    participant IX as Event Indexer

    Referee->>FE: Click "Claim rewards"
    FE->>RPC: simulateTransaction (rewards.claim)
    RPC-->>FE: Fee estimate
    FE->>Referee: Sign transaction prompt
    Referee-->>FE: Signed XDR
    FE->>RPC: sendTransaction (signed XDR)
    RPC->>RC: claim(referee, amount)
    RC->>RC: Deduct balance, emit "claim" event
    RC-->>RPC: Ok(new_balance)
    RPC-->>FE: txHash + status
    FE-->>Referee: "Claimed!"

    note over BE: Indexer picks up "claim" event
    IX->>BE: claim event for referee

    BE->>BE: Look up referrer = campaign.referrer_of(referee)
    BE->>BE: Compute qualifying_amount from claim event
    BE->>RPC: simulateTransaction (rewards.pay_referral_bonus)
    RPC-->>BE: Fee estimate
    BE->>RPC: sendTransaction (admin-signed XDR)
    RPC->>RC: pay_referral_bonus(admin, referrer, referee, qualifying_amount)
    RC->>RC: Enforce anti-abuse invariants (self, circular, replay, cap, zero)
    RC->>RC: bonus = qualifying_amount * rate_bps / 10_000
    RC->>RC: Increment referrer balance
    RC->>RC: Emit "credit" + "ref_bonus" events
    RC-->>RPC: Ok(bonus)
    RPC-->>BE: txHash + status
    BE-->>IX: ref_bonus event → write referral_bonus_events row
    note over Referrer: Referrer can now claim their bonus via flow 2
```

### Edge cases

#### Referrer wallet disconnected / inactive at bonus time

The referrer does not need to be online or connected. `pay_referral_bonus` credits the referrer's
**on-chain balance** directly; the referrer can call `claim` at any point in the future to withdraw
it. The bonus is not lost if the referrer is inactive.

#### Referred user never claims

The referral bonus is triggered by the referee's **qualifying action** (a successful `claim` on the
rewards contract). If the referee never claims, the backend never calls `pay_referral_bonus` and
the referrer receives no bonus. There is no timeout or expiry that auto-pays; the bonus is strictly
contingent on the referee completing the action.

#### Referral invariant violations

If the backend attempts `pay_referral_bonus` and an on-chain invariant is violated, the contract
returns an error and **no state is written** (all-or-nothing). The possible errors are:

| Scenario | Contract error |
|----------|---------------|
| Referee has already triggered a bonus for this referrer | `ReferralAlreadyRewarded` |
| Referrer and referee are the same address | `SelfReferral` |
| Circular referral (A referred B; B tries to bonus A) | `CircularReferral` |
| Referrer has hit their cumulative cap | `ReferralCapExceeded` |
| Computed bonus rounds down to zero | `ZeroReferralBonus` |
| Referral rate not configured | `ReferralNotConfigured` |

In all error cases the referee's claim still succeeds; only the referrer bonus is withheld.
