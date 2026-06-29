# Analytics Event Taxonomy

## Overview

This document defines the complete event taxonomy for Trivela's privacy-respecting analytics pipeline. All events follow strict privacy principles: no PII collection, consent-aware tracking, and local storage preference.

## Privacy Principles

1. **No PII Collection**: Never collect wallet addresses, IP addresses, or identifying information
2. **Consent-Aware**: Respect user consent preferences (opt-out by default in some regions)
3. **Anonymized IDs**: Use hashed, anonymized session IDs
4. **Retention Limits**: 90-day data retention for aggregate metrics
5. **No Third-Party**: Self-hosted analytics, no external trackers

## Event Structure

All events follow this base schema:

```typescript
interface BaseEvent {
  event_name: string;
  timestamp: string; // ISO 8601
  session_id: string; // Anonymized session identifier
  campaign_id?: string; // Optional campaign context
  source?: string; // UTM source
  medium?: string; // UTM medium
  campaign?: string; // UTM campaign
  properties: Record<string, string | number | boolean>;
}
```

## Funnel Events

### 1. Wallet Connection Events

#### `wallet_connect_initiated`
Fired when user clicks "Connect Wallet" button.

**Properties:**
- `provider`: `'freighter' | 'albedo' | 'xbull' | 'rabet'`
- `page`: Current page path
- `campaign_id`: Campaign ID if on campaign page

**Example:**
```json
{
  "event_name": "wallet_connect_initiated",
  "timestamp": "2026-06-29T10:30:00.000Z",
  "session_id": "anon_abc123def456",
  "properties": {
    "provider": "freighter",
    "page": "/campaigns/CAMP_001",
    "campaign_id": "CAMP_001"
  }
}
```

#### `wallet_connect_success`
Fired when wallet connection succeeds.

**Properties:**
- `provider`: Wallet provider used
- `network`: `'mainnet' | 'testnet' | 'futurenet'`
- `time_to_connect_ms`: Time from initiation to success

#### `wallet_connect_failed`
Fired when wallet connection fails.

**Properties:**
- `provider`: Wallet provider attempted
- `error_type`: Error category (`user_rejected`, `not_installed`, `network_error`, `unknown`)
- `time_to_failure_ms`: Time from initiation to failure

---

### 2. Campaign Registration Events

#### `registration_viewed`
Fired when user views registration section.

**Properties:**
- `campaign_id`: Campaign identifier
- `privacy_mode`: `'open' | 'merkle' | 'zk'`
- `is_registered`: Current registration status
- `time_remaining_hours`: Hours until campaign ends

#### `registration_initiated`
Fired when user clicks "Register" button.

**Properties:**
- `campaign_id`: Campaign identifier
- `privacy_mode`: Privacy mode used
- `has_allowlist_proof`: Whether user has proof ready (for Merkle mode)

#### `registration_tx_signed`
Fired when user signs registration transaction.

**Properties:**
- `campaign_id`: Campaign identifier
- `privacy_mode`: Privacy mode used
- `time_to_sign_ms`: Time from initiation to signing

#### `registration_success`
Fired when registration transaction confirms.

**Properties:**
- `campaign_id`: Campaign identifier
- `privacy_mode`: Privacy mode used
- `tx_fee_xlm`: Transaction fee paid
- `time_to_confirm_ms`: Total time from initiation to confirmation
- `already_registered`: Whether user was already registered

#### `registration_failed`
Fired when registration fails.

**Properties:**
- `campaign_id`: Campaign identifier
- `privacy_mode`: Privacy mode used
- `error_type`: Error category
- `stage`: Where in the process it failed (`signing`, `simulation`, `submission`, `confirmation`)

---

### 3. Claim/Redeem Events

#### `rewards_viewed`
Fired when user views their rewards balance.

**Properties:**
- `campaign_id`: Campaign identifier (if applicable)
- `balance_points`: Current points balance (rounded to 100s for privacy)
- `has_payout_asset`: Whether campaign has payout asset configured

#### `claim_initiated`
Fired when user starts claim process.

**Properties:**
- `campaign_id`: Campaign identifier
- `claim_type`: `'points' | 'redeem'`
- `amount_requested`: Amount requested (rounded to 100s)

#### `claim_tx_signed`
Fired when user signs claim transaction.

**Properties:**
- `campaign_id`: Campaign identifier
- `claim_type`: Claim type
- `time_to_sign_ms`: Time from initiation to signing

#### `claim_success`
Fired when claim transaction confirms.

**Properties:**
- `campaign_id`: Campaign identifier
- `claim_type`: Claim type
- `amount_claimed`: Amount claimed (rounded to 100s)
- `tx_fee_xlm`: Transaction fee paid
- `time_to_confirm_ms`: Total time from initiation to confirmation

#### `claim_failed`
Fired when claim fails.

**Properties:**
- `campaign_id`: Campaign identifier
- `claim_type`: Claim type
- `error_type`: Error category
- `stage`: Failure stage

---

### 4. Campaign Discovery Events

#### `campaign_list_viewed`
Fired when user views campaign list.

**Properties:**
- `filter_status`: `'active' | 'upcoming' | 'ended' | 'all'`
- `filter_category`: Category filter applied (if any)
- `campaigns_visible`: Number of campaigns displayed

#### `campaign_card_clicked`
Fired when user clicks a campaign card.

**Properties:**
- `campaign_id`: Campaign identifier
- `campaign_status`: `'active' | 'upcoming' | 'ended'`
- `position`: Card position in list (1-indexed)
- `source_page`: Page where card was clicked

#### `campaign_detail_viewed`
Fired when user views campaign detail page.

**Properties:**
- `campaign_id`: Campaign identifier
- `campaign_status`: Campaign status
- `has_payout_asset`: Whether campaign has payout
- `privacy_mode`: Campaign privacy mode
- `days_remaining`: Days until campaign ends (if active)

---

### 5. Campaign Creation Events

#### `campaign_create_started`
Fired when user opens campaign creation flow.

**Properties:**
- `is_admin`: Whether user is admin
- `has_created_before`: Whether user has created campaigns before

#### `campaign_create_step_completed`
Fired when user completes a creation step.

**Properties:**
- `step`: Step identifier (`'basic_info' | 'rewards' | 'privacy' | 'review'`)
- `step_number`: Step index
- `time_on_step_ms`: Time spent on step

#### `campaign_create_success`
Fired when campaign creation succeeds.

**Properties:**
- `campaign_id`: New campaign identifier
- `privacy_mode`: Privacy mode selected
- `has_payout_asset`: Whether payout asset configured
- `total_time_ms`: Total creation time
- `steps_visited`: Number of steps visited (including back navigation)

#### `campaign_create_abandoned`
Fired when user abandons creation flow.

**Properties:**
- `last_step`: Last step reached
- `time_spent_ms`: Total time in flow before abandoning

---

## Session Events

#### `session_started`
Fired when a new session begins.

**Properties:**
- `entry_page`: First page visited
- `source`: UTM source (if present)
- `medium`: UTM medium (if present)
- `campaign`: UTM campaign (if present)
- `referrer_domain`: Referrer domain (not full URL)

#### `page_viewed`
Fired on each page view.

**Properties:**
- `page_path`: Page path (no query params)
- `page_title`: Page title
- `previous_page`: Previous page path

---

## Conversion Metrics

### Primary Funnel
```
Session Start → Campaign View → Connect → Register → Claim → Redeem
```

### Drop-off Points Measured
1. Campaign view → Connect attempt
2. Connect attempt → Connect success
3. Connect success → Registration view
4. Registration view → Registration attempt
5. Registration attempt → Registration success
6. Registration success → Claim attempt
7. Claim attempt → Claim success

### Retention Metrics
- Day 1, 7, 30 return rates
- Campaigns participated per user (bucketed: 1, 2-5, 6-10, 11+)
- Average time between registration and first claim

---

## Campaign Attribution

All events can be attributed to acquisition source via UTM parameters:

- `utm_source`: Traffic source (e.g., `twitter`, `discord`, `email`)
- `utm_medium`: Marketing medium (e.g., `social`, `email`, `referral`)
- `utm_campaign`: Specific campaign name (e.g., `launch_week`, `partnership_xyz`)

Attribution persists for the session duration.

---

## Technical Events (Optional)

These events track technical performance for debugging:

#### `transaction_simulation_failed`
**Properties:**
- `operation_type`: Operation that failed
- `error_code`: Soroban error code
- `network`: Network used

#### `rpc_request_timeout`
**Properties:**
- `endpoint`: RPC endpoint
- `timeout_ms`: Timeout threshold
- `operation`: Operation attempted

---

## Data Export Format

Events are exported in newline-delimited JSON (NDJSON) for analysis:

```json
{"event_name":"wallet_connect_success","timestamp":"2026-06-29T10:30:15Z","session_id":"anon_abc","properties":{"provider":"freighter","network":"testnet","time_to_connect_ms":2340}}
{"event_name":"registration_initiated","timestamp":"2026-06-29T10:31:00Z","session_id":"anon_abc","campaign_id":"CAMP_001","properties":{"privacy_mode":"open"}}
{"event_name":"registration_success","timestamp":"2026-06-29T10:31:45Z","session_id":"anon_abc","campaign_id":"CAMP_001","properties":{"privacy_mode":"open","tx_fee_xlm":"0.0001","time_to_confirm_ms":45000}}
```

---

## Consent Management

Users can opt-out via:
1. Cookie banner on first visit
2. Privacy settings in user profile
3. Browser Do-Not-Track header (automatically respected)

When opted-out:
- No events are collected
- Local storage cleared
- Analytics scripts not loaded

---

## Retention Policy

- **Raw events**: 90 days
- **Aggregated metrics**: 2 years
- **Campaign-level stats**: Permanent (anonymized)

---

## GDPR/Privacy Compliance

✅ No personal identifiable information collected  
✅ Anonymized session IDs (not linkable across sessions)  
✅ Opt-out mechanism provided  
✅ Data retention limits enforced  
✅ No third-party trackers  
✅ Self-hosted analytics infrastructure  
✅ Data export available on request  

---

## Dashboard Metrics

### Funnel Overview
- Total sessions
- Unique campaigns viewed
- Wallet connections (attempts, success rate)
- Registrations (attempts, success rate)
- Claims (attempts, success rate, volume)
- Redeems (attempts, success rate, volume)

### Conversion Rates
- Campaign view → Wallet connect: X%
- Wallet connect → Registration: X%
- Registration → Claim: X%
- Claim → Redeem: X%

### Drop-off Analysis
- Top drop-off point: [Stage]
- Average time to complete funnel: X minutes
- Funnel completion rate: X%

### Source Attribution
- Top acquisition sources
- Conversion rate by source
- Campaign performance by source

---

## Implementation Notes

1. **Client-side**: Events tracked via `trackEvent()` utility
2. **Server-side**: API endpoint events tracked via middleware
3. **Batch processing**: Events buffered and sent in batches (max 10 events or 5 seconds)
4. **Offline support**: Events queued when offline, sent when online
5. **Performance**: Non-blocking, async event tracking
6. **Error handling**: Failed events logged locally, not retried

---

Last updated: 2026-06-29  
Version: 1.0.0
