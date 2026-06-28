# Issue #624: A/B Testing Framework for Campaign Variants

## Overview

This implementation adds a comprehensive A/B testing framework to the Trivela platform, allowing
campaign operators to create and test multiple variants of their campaigns to optimize conversion
rates.

## Features Implemented

### 1. **Database Schema** (Migration 010)

- `campaign_variants` table: Stores variant configurations
- `variant_assignments` table: Tracks user-to-variant assignments
- `variant_results` table: Records metrics and experiment outcomes

### 2. **Data Access Layer**

- **Repository** (`sqliteVariantRepository.js`): Full CRUD operations for variants, assignments, and
  results
- **Integration**: Seamlessly integrated with existing campaign infrastructure

### 3. **Business Logic**

- **Service** (`variantService.js`):
  - Deterministic variant assignment based on traffic weights
  - Sticky assignment support (users consistently see the same variant)
  - Result tracking and aggregation
  - Statistical significance calculation (z-test for proportions)

### 4. **API Endpoints**

All endpoints under `/api/v1/campaigns/:campaignId/variants` (requires API key):

#### Variant Management

- `POST /campaigns/:campaignId/variants` - Create a new variant
- `GET /campaigns/:campaignId/variants` - List all variants
- `GET /campaigns/:campaignId/variants/:variantId` - Get variant details
- `PUT /campaigns/:campaignId/variants/:variantId` - Update variant
- `DELETE /campaigns/:campaignId/variants/:variantId` - Delete variant

#### Assignment & Tracking

- `POST /campaigns/:campaignId/variants/assign` - Assign user to a variant
- `GET /campaigns/:campaignId/variants/assignment/:userId` - Get user's assignment
- `POST /campaigns/:campaignId/variants/results` - Track a metric result
- `GET /campaigns/:campaignId/variants/results/:metricName` - Get experiment results
- `GET /campaigns/:campaignId/variants/stats/assignments` - Get assignment statistics

### 5. **Validation & Schemas**

- Zod schemas for all request/response validation
- Traffic weight validation (must sum to ≤100%)
- Variant key format validation (alphanumeric + underscores)

### 6. **Testing**

- Comprehensive unit tests for service layer
- Tests cover assignment logic, result tracking, and statistical calculations

## Technical Design

### Variant Assignment Algorithm

The system uses a **deterministic hash-based assignment** to ensure:

1. Same user always gets the same variant (consistency)
2. Traffic is distributed according to configured weights
3. No need for centralized coordination

```javascript
// Simplified algorithm
function selectVariant(variants, userId) {
  const hash = simpleHash(userId);
  const totalWeight = sum(variants.map((v) => v.trafficWeight));
  const selection = hash % totalWeight;

  // Find variant based on cumulative weight
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.trafficWeight;
    if (selection < cumulative) return variant;
  }
}
```

### Traffic Split Configuration

Operators configure traffic weights (0-100%) for each variant:

```json
{
  "control": 50, // 50% of users
  "variant_a": 30, // 30% of users
  "variant_b": 20 // 20% of users
}
```

**Note**: Total can be <100% to exclude some traffic from the experiment.

### Statistical Significance

The system calculates z-test for proportions to determine if variant improvements are statistically
significant:

```javascript
const zScore = (p2 - p1) / SE;
const pValue = 2 * (1 - normalCDF(abs(zScore)));
const isSignificant = pValue < 0.05; // 95% confidence
```

## Usage Examples

### Example 1: Creating an A/B Test

```bash
# Step 1: Create control variant
curl -X POST http://localhost:3001/api/v1/campaigns/1/variants \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "variantKey": "control",
    "name": "Original Campaign",
    "trafficWeight": 50,
    "isControl": true,
    "config": {
      "headline": "Join Our Campaign",
      "buttonText": "Sign Up Now"
    }
  }'

# Step 2: Create variant A
curl -X POST http://localhost:3001/api/v1/campaigns/1/variants \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "variantKey": "variant_a",
    "name": "Alternative Headline",
    "trafficWeight": 50,
    "config": {
      "headline": "Earn Rewards Today",
      "buttonText": "Get Started"
    }
  }'
```

### Example 2: Assigning a User

```bash
# Assign user to a variant (sticky by default)
curl -X POST http://localhost:3001/api/v1/campaigns/1/variants/assign \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "G...WALLET_ADDRESS",
    "sticky": true
  }'

# Response:
{
  "variantId": "1",
  "variantKey": "control",
  "isNewAssignment": true
}
```

### Example 3: Tracking Results

```bash
# Track a conversion event
curl -X POST http://localhost:3001/api/v1/campaigns/1/variants/results \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "G...WALLET_ADDRESS",
    "metricName": "conversion",
    "metricValue": 1,
    "metadata": {
      "source": "landing_page"
    }
  }'
```

### Example 4: Analyzing Results

```bash
# Get experiment results for conversion metric
curl http://localhost:3001/api/v1/campaigns/1/variants/results/conversion \
  -H "X-API-Key: your-api-key"

# Response:
{
  "campaignId": "1",
  "metricName": "conversion",
  "results": [
    {
      "variantId": "1",
      "variantKey": "control",
      "name": "Original Campaign",
      "sampleCount": 1000,
      "mean": 0.15,
      "min": 0,
      "max": 1,
      "assignmentCount": 1000
    },
    {
      "variantId": "2",
      "variantKey": "variant_a",
      "name": "Alternative Headline",
      "sampleCount": 1000,
      "mean": 0.18,
      "min": 0,
      "max": 1,
      "assignmentCount": 1000,
      "significance": {
        "pValue": 0.023,
        "isSignificant": true,
        "improvement": 20,
        "zScore": 2.28
      }
    }
  ]
}
```

## Database Schema

### campaign_variants

| Column         | Type    | Description                                  |
| -------------- | ------- | -------------------------------------------- |
| id             | INTEGER | Primary key                                  |
| campaign_id    | INTEGER | Foreign key to campaigns                     |
| variant_key    | TEXT    | Unique key (e.g., 'control', 'variant_a')    |
| name           | TEXT    | Human-readable name                          |
| description    | TEXT    | Optional description                         |
| traffic_weight | INTEGER | Traffic percentage (0-100)                   |
| is_control     | INTEGER | Boolean: is this the control variant?        |
| active         | INTEGER | Boolean: is variant active?                  |
| config         | TEXT    | JSON blob for variant-specific configuration |
| created_at     | TEXT    | ISO timestamp                                |
| updated_at     | TEXT    | ISO timestamp                                |

### variant_assignments

| Column      | Type    | Description                                     |
| ----------- | ------- | ----------------------------------------------- |
| id          | INTEGER | Primary key                                     |
| campaign_id | INTEGER | Foreign key to campaigns                        |
| variant_id  | INTEGER | Foreign key to campaign_variants                |
| user_id     | TEXT    | User identifier (wallet address, session, etc.) |
| assigned_at | TEXT    | ISO timestamp                                   |
| sticky      | INTEGER | Boolean: keep user in same variant?             |

### variant_results

| Column       | Type    | Description                                          |
| ------------ | ------- | ---------------------------------------------------- |
| id           | INTEGER | Primary key                                          |
| campaign_id  | INTEGER | Foreign key to campaigns                             |
| variant_id   | INTEGER | Foreign key to campaign_variants                     |
| metric_name  | TEXT    | Metric identifier (e.g., 'conversion', 'engagement') |
| metric_value | REAL    | The measured value                                   |
| user_id      | TEXT    | Optional: user who generated this metric             |
| recorded_at  | TEXT    | ISO timestamp                                        |
| metadata     | TEXT    | JSON blob for additional context                     |

## Integration Points

### With Existing Campaign System

- Variants are scoped to campaigns via `campaign_id` foreign key
- CASCADE deletion ensures cleanup when campaign is deleted
- Variants inherit campaign context but can override configuration

### With Rate Limiting

- All variant endpoints protected by existing rate limiter
- API key required for all operations
- Rate limiting keys per API key when present, per IP otherwise

### With Audit Logging

- Future enhancement: Audit trail for variant CRUD operations
- Can leverage existing audit log infrastructure

## Best Practices

### Setting Up an Experiment

1. **Start with a control**: Always mark one variant as `isControl: true`
2. **Equal traffic initially**: Use 50/50 split until you have data
3. **Define success metrics**: Decide on 'conversion', 'engagement', etc. upfront
4. **Minimum sample size**: Collect at least 100-1000 samples per variant before making decisions
5. **Statistical significance**: Wait for p-value < 0.05 before declaring a winner

### Traffic Weight Strategy

- **Safe approach**: Start with small percentage (e.g., control: 90%, variant: 10%)
- **Standard A/B**: Equal split (50/50)
- **Multi-variant**: Distribute evenly (e.g., 33/33/34 for 3 variants)
- **Winner rollout**: Gradually shift traffic to winning variant (e.g., 70/30, then 90/10)

### Metrics to Track

Common metrics for campaign optimization:

- `conversion`: Did user complete the desired action? (0 or 1)
- `engagement_time`: Time spent interacting (seconds)
- `click_through`: Did user click the CTA? (0 or 1)
- `claim_rate`: Did user claim rewards? (0 or 1)
- `referrals`: Number of referrals generated

## Files Changed/Created

### New Files

- `backend/src/db/migrations/010_campaign_variants.js` - Database schema
- `backend/src/dal/sqliteVariantRepository.js` - Data access layer
- `backend/src/services/variantService.js` - Business logic
- `backend/src/routes/variants.js` - API routes
- `backend/src/services/variantService.test.js` - Unit tests
- `IMPLEMENTATION_ISSUE_624.md` - This documentation

### Modified Files

- `backend/src/schemas.js` - Added variant validation schemas
- `backend/src/dal/index.js` - Integrated variant repository
- `backend/src/index.js` - Registered variant routes and service

## Testing

Run tests with:

```bash
cd backend
npm test src/services/variantService.test.js
```

Tests cover:

- Variant assignment based on traffic weights
- Sticky assignments (user consistency)
- Result tracking
- Statistical significance calculations
- Traffic weight validation
- Error handling

## Future Enhancements

1. **Multi-armed bandits**: Automatically adjust traffic to winning variants
2. **Segment-based assignment**: Assign variants based on user attributes
3. **Time-based scheduling**: Auto-activate/deactivate variants
4. **Bayesian statistics**: More sophisticated significance testing
5. **Frontend SDK**: JavaScript library for easy integration
6. **Dashboard UI**: Visual interface for managing experiments
7. **Webhook events**: Notify external systems of experiment milestones

## Security Considerations

- All endpoints require API key authentication
- Rate limiting prevents abuse
- SQL injection protected via parameterized queries
- No PII stored (user_id is application-defined)
- Results aggregation prevents individual user tracking

## Performance Considerations

- Variant assignment is O(N) where N = number of variants (typically 2-5)
- Hash function is deterministic and fast
- Database indexes on foreign keys for efficient queries
- Results can be cached/aggregated for large-scale analysis

## Compliance & Privacy

- User IDs are application-defined (can be hashed wallet addresses)
- No personally identifiable information required
- Supports GDPR "right to be forgotten" via user_id deletion
- Results can be anonymized by omitting user_id

## Conclusion

This implementation provides a production-ready A/B testing framework that integrates seamlessly
with Trivela's existing campaign infrastructure. It enables data-driven optimization of campaigns
through controlled experiments with statistical rigor.

---

**Issue**: #624 **Status**: ✅ Complete **Author**: Williams-1604 **Date**: 2026-06-18
