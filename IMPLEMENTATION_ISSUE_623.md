# Issue #623: Cohort & Retention Analysis API

## Overview

This implementation adds a comprehensive cohort and retention analysis API to the Trivela platform,
enabling campaign operators to answer questions like "of users who registered in week N, how many
claimed by week N+k?"

## Features Implemented

### 1. **Database Schema** (Migration 011)

- `user_activities` table: Tracks all user events (registered, claimed, active)
- `cohort_stats` table: Precomputed cohort statistics for performance
- `retention_data` table: Precomputed retention curves

### 2. **Data Access Layer**

- **Repository** (`sqliteCohortRepository.js`): Complete data access for cohort analysis
  - Record user activities
  - Save/retrieve cohort statistics
  - Save/retrieve retention data
  - Support for cache invalidation

### 3. **Business Logic Service**

- **Service** (`cohortService.js`):
  - Compute cohorts by registration period
  - Calculate retention curves with offset tracking
  - Support for multiple granularities (day, week, month)
  - Support for multiple metrics (claimed, active)
  - Deterministic and testable outputs
  - Caching with recomputation support

### 4. **REST API Endpoints**

All endpoints under `/api/v1/campaigns/:campaignId/cohorts` (requires API key):

#### Cohort Analysis

- `GET /campaigns/:campaignId/cohorts` - Get full cohort analysis with retention curves
  - Query params: `granularity` (day/week/month), `metric` (claimed/active), `recompute` (bool)
- `GET /campaigns/:campaignId/cohorts/:cohortPeriod/retention` - Get retention curve for specific
  cohort
  - Query params: `granularity`, `metric`

#### Recomputation

- `POST /campaigns/:campaignId/cohorts/recompute` - Force recomputation of cohort data
  - Query params: `granularity`, `metric`

#### Activity Recording

- `POST /campaigns/:campaignId/activities` - Record user activity (for testing/manual entry)
  - Body: `{ userAddress, activityType, occurredAt?, metadata? }`

### 5. **Validation & Testing**

- Zod schemas for request/response validation
- Comprehensive unit tests with deterministic fixtures
- Hand-computed expected values for verification
- Tests cover all granularities and metric types

## Technical Design

### Cohort Definition

A **cohort** is a group of users who registered in the same time period (day, week, or month).
Cohorts are identified by period strings:

- Day: `2024-01-15`
- Week: `2024-W03` (ISO week number)
- Month: `2024-01`

### Retention Calculation

**Retention** measures how many users from a cohort performed an activity at a given offset from
their registration:

- Offset 0: Same period as registration
- Offset 1: One period later
- Offset 2: Two periods later
- etc.

**Retention Rate** = (Users who performed activity at offset) / (Cohort size) × 100%

### Period Handling

- **UTC timezone**: All timestamps are normalized to UTC
- **Week numbering**: ISO 8601 week-date system (week 1 contains first Thursday)
- **Period boundaries**: Inclusive start, exclusive end

### Deterministic Assignment

The algorithm assigns users to cohorts based on their registration timestamp:

```javascript
registrationDate → getPeriodString(date, granularity) → cohortPeriod
```

Activities are matched to cohorts, and offset is calculated:

```javascript
cohortPeriod + activityPeriod + granularity → offset
```

### Caching Strategy

- **Precomputation**: Cohort stats and retention data are computed once and cached
- **Recomputation**: Can be triggered manually or when `recompute=true`
- **Cache invalidation**: `clearCache()` removes all cached data for a campaign

## Usage Examples

### Example 1: Weekly Cohort Analysis for Claims

```bash
# Get weekly cohorts with claim retention
curl "http://localhost:3001/api/v1/campaigns/1/cohorts?granularity=week&metric=claimed" \
  -H "X-API-Key: your-api-key"
```

**Response:**

```json
{
  "campaignId": "1",
  "granularity": "week",
  "metricType": "claimed",
  "cohorts": [
    {
      "cohortPeriod": "2024-W01",
      "cohortSize": 150,
      "periodStart": "2024-01-01T00:00:00.000Z",
      "periodEnd": "2024-01-08T00:00:00.000Z",
      "retention": [
        { "offset": 0, "userCount": 100, "retentionRate": 66.67 },
        { "offset": 1, "userCount": 75, "retentionRate": 50.0 },
        { "offset": 2, "userCount": 45, "retentionRate": 30.0 }
      ]
    },
    {
      "cohortPeriod": "2024-W02",
      "cohortSize": 200,
      "periodStart": "2024-01-08T00:00:00.000Z",
      "periodEnd": "2024-01-15T00:00:00.000Z",
      "retention": [
        { "offset": 0, "userCount": 140, "retentionRate": 70.0 },
        { "offset": 1, "userCount": 100, "retentionRate": 50.0 }
      ]
    }
  ]
}
```

### Example 2: Daily Cohort Analysis for Active Users

```bash
# Get daily cohorts with active user retention
curl "http://localhost:3001/api/v1/campaigns/1/cohorts?granularity=day&metric=active" \
  -H "X-API-Key: your-api-key"
```

### Example 3: Get Specific Cohort Retention Curve

```bash
# Get retention curve for week 1
curl "http://localhost:3001/api/v1/campaigns/1/cohorts/2024-W01/retention?granularity=week&metric=claimed" \
  -H "X-API-Key: your-api-key"
```

**Response:**

```json
{
  "cohortPeriod": "2024-W01",
  "cohortSize": 150,
  "retention": [
    { "offset": 0, "userCount": 100, "retentionRate": 66.67 },
    { "offset": 1, "userCount": 75, "retentionRate": 50.0 },
    { "offset": 2, "userCount": 45, "retentionRate": 30.0 },
    { "offset": 3, "userCount": 30, "retentionRate": 20.0 }
  ]
}
```

### Example 4: Force Recomputation

```bash
# Recompute cohort data (after reconciliation or data updates)
curl -X POST "http://localhost:3001/api/v1/campaigns/1/cohorts/recompute?granularity=week&metric=claimed" \
  -H "X-API-Key: your-api-key"
```

### Example 5: Record User Activities

```bash
# Record user registration
curl -X POST "http://localhost:3001/api/v1/campaigns/1/activities" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "GABC...XYZ",
    "activityType": "registered",
    "occurredAt": "2024-01-15T10:30:00Z"
  }'

# Record user claim
curl -X POST "http://localhost:3001/api/v1/campaigns/1/activities" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "GABC...XYZ",
    "activityType": "claimed",
    "occurredAt": "2024-01-20T14:15:00Z"
  }'
```

## Database Schema

### user_activities

| Column        | Type    | Description                       |
| ------------- | ------- | --------------------------------- |
| id            | INTEGER | Primary key                       |
| campaign_id   | INTEGER | Foreign key to campaigns          |
| user_address  | TEXT    | User identifier (wallet address)  |
| activity_type | TEXT    | 'registered', 'claimed', 'active' |
| occurred_at   | TEXT    | ISO 8601 timestamp (UTC)          |
| ledger        | INTEGER | Optional: on-chain ledger number  |
| tx_hash       | TEXT    | Optional: transaction hash        |
| metadata      | TEXT    | JSON blob for additional context  |
| created_at    | TEXT    | Record creation timestamp         |

**Indexes:**

- `campaign_id`
- `campaign_id, user_address`
- `campaign_id, activity_type`
- `campaign_id, occurred_at`
- `campaign_id, user_address, activity_type`

### cohort_stats

| Column        | Type    | Description                          |
| ------------- | ------- | ------------------------------------ |
| id            | INTEGER | Primary key                          |
| campaign_id   | INTEGER | Foreign key to campaigns             |
| cohort_period | TEXT    | Period identifier (e.g., '2024-W01') |
| cohort_size   | INTEGER | Number of users in cohort            |
| granularity   | TEXT    | 'day', 'week', 'month'               |
| period_start  | TEXT    | ISO 8601 timestamp (period start)    |
| period_end    | TEXT    | ISO 8601 timestamp (period end)      |
| computed_at   | TEXT    | When this was computed               |

**Unique constraint:** `(campaign_id, cohort_period, granularity)`

### retention_data

| Column        | Type    | Description                            |
| ------------- | ------- | -------------------------------------- |
| id            | INTEGER | Primary key                            |
| campaign_id   | INTEGER | Foreign key to campaigns               |
| cohort_period | TEXT    | Period identifier                      |
| offset_period | INTEGER | Offset from cohort (0, 1, 2, ...)      |
| metric_type   | TEXT    | 'claimed', 'active'                    |
| user_count    | INTEGER | Number of users who performed activity |
| granularity   | TEXT    | 'day', 'week', 'month'                 |
| computed_at   | TEXT    | When this was computed                 |

**Unique constraint:** `(campaign_id, cohort_period, offset_period, metric_type, granularity)`

## Integration Points

### With Event Indexer

The cohort system can be integrated with the existing event indexer (`eventIndexer.js`) to
automatically record user activities from on-chain events:

- `credit` events → record as "registered"
- `claim` events → record as "claimed"
- Contract interactions → record as "active"

### With Dashboard UI

The retention data is structured for easy visualization:

- Cohort table view (rows = cohorts, columns = offset periods)
- Retention curves (line charts showing decay over time)
- Comparative cohort analysis

## Edge Cases Handled

### 1. Timezone/Period Boundaries (UTC)

- All timestamps normalized to UTC
- Period boundaries use UTC midnight
- ISO 8601 week numbering (first Thursday rule)

### 2. Small Cohorts

- System reports actual counts, not suppressed
- Frontend can flag low-n cohorts (e.g., < 30 users)
- Retention rates always calculated, even for small cohorts

### 3. Re-computation After Reconciliation

- `recompute` flag clears cache and recomputes from raw data
- Idempotent: safe to run multiple times
- Preserves historical activity data

### 4. Users Without Registration

- System requires registration activity first
- Activities before registration are ignored (shouldn't happen in normal flow)
- Missing cohort assignment results in activity being skipped

### 5. Multiple Activities

- Same user can have multiple activities in different periods
- Each activity counted separately
- Deduplication at query level (distinct users per offset)

## Performance Considerations

### Caching Strategy

- First query computes and caches all cohorts + retention
- Subsequent queries read from cache (fast)
- Recomputation only when explicitly requested or data changes

### Query Optimization

- Indexed queries on `campaign_id`, `occurred_at`, `activity_type`
- Precomputed aggregations avoid expensive GROUP BY on reads
- Retention data denormalized for fast lookup

### Scalability

- Computation time: O(N) where N = number of activities
- Storage: O(C × P) where C = cohorts, P = max offset periods
- Typical dataset: 1000 cohorts × 52 weeks = 52K rows (small)

## Testing Strategy

### Deterministic Fixture Tests

Tests use hand-computed expected values:

```javascript
// Week 1 (2024-W01): 3 users register
// Week 2 (2024-W02): 2 users register
// Various claims at different offsets
// Expected: Week 1 cohort size = 3, offset 0 retention = 66.67%, etc.
```

### Coverage

- ✅ All granularities (day, week, month)
- ✅ All metric types (claimed, active)
- ✅ Specific cohort queries
- ✅ Recomputation and cache clearing
- ✅ Empty cohort handling
- ✅ Error cases (non-existent cohorts)

### Test Results

All 8 cohort service tests passing with deterministic, hand-verified outputs.

## Files Changed/Created

### New Files

- `backend/src/db/migrations/011_cohort_retention_tables.js` - Database schema
- `backend/src/dal/sqliteCohortRepository.js` - Data access layer
- `backend/src/services/cohortService.js` - Business logic
- `backend/src/routes/cohorts.js` - API routes
- `backend/src/services/cohortService.test.js` - Unit tests
- `IMPLEMENTATION_ISSUE_623.md` - This documentation

### Modified Files

- `backend/src/dal/index.js` - Integrated cohort repository
- `backend/src/index.js` - Registered cohort service and routes

## Acceptance Criteria

✅ **A known fixture yields the expected cohort/retention curves**

- Implemented deterministic test with hand-computed values
- Week 1 cohort: 3 users, retention verified at offsets 0, 1, 2
- Week 2 cohort: 2 users, retention verified at offset 0
- All retention rates match expected percentages

## Future Enhancements

1. **Automated activity recording**: Integrate with event indexer for automatic tracking
2. **Cohort comparison**: API endpoint to compare retention curves between cohorts
3. **Survival analysis**: Kaplan-Meier curves for long-term retention
4. **Predictive retention**: ML models to forecast future retention
5. **Segment-based cohorts**: Group by user attributes (country, device, referral source)
6. **Export functionality**: CSV/JSON export of cohort data
7. **Real-time updates**: WebSocket notifications when new cohort data is available

## Security Considerations

- All endpoints require API key authentication
- Rate limiting applies to all cohort endpoints
- Campaign ID validation prevents unauthorized access
- SQL injection protected via parameterized queries
- User addresses can be hashed for privacy

## Deployment Notes

### Database Migration

Run migration before deploying:

```bash
npm run db:migrate
```

### Environment Variables

No new environment variables required. Uses existing:

- `DB_PATH` - Database file location
- `RATE_LIMIT_*` - Rate limiting configuration

### Backward Compatibility

- New endpoints only, no breaking changes
- Existing APIs unchanged
- Migration is additive (no data loss)

---

**Issue**: #623  
**Status**: ✅ Complete  
**Author**: Williams-1604  
**Date**: 2026-06-18
