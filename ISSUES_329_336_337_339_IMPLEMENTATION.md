# Implementation Summary: Issues #329, #336, #337, #339

This document provides implementation guidance for four Trivela enhancements.

## Summary

| Issue | Title                          | Type     | Effort | Status        |
| ----- | ------------------------------ | -------- | ------ | ------------- |
| #339  | Campaign Auto-Deactivation Job | Backend  | 4-6h   | ✅ Documented |
| #336  | GraphQL API Layer              | Backend  | 8-12h  | ✅ Documented |
| #337  | GDPR Data Export/Deletion      | Backend  | 6-8h   | ✅ Documented |
| #329  | Campaign Rewards Multiplier    | Contract | 5-7h   | ✅ Documented |

**Total Effort**: 23-33 hours

---

## Issue #339: Campaign Auto-Deactivation Job

### Implementation

Create `backend/src/jobs/campaignExpiryCheck.js`:

```javascript
const logger = require('../config/logger');
const db = require('../db');
const { auditLog } = require('../dal/auditLogRepository');

const EXPIRY_CHECK_INTERVAL_MS = parseInt(process.env.EXPIRY_CHECK_INTERVAL_MS || '300000', 10); // 5 min

async function checkExpiredCampaigns() {
  const now = new Date();

  try {
    const expiredCampaigns = await db.query(
      `SELECT * FROM campaigns WHERE active = 1 AND endDate IS NOT NULL AND endDate < ?`,
      [now],
    );

    for (const campaign of expiredCampaigns.rows) {
      await db.query(`UPDATE campaigns SET active = 0 WHERE id = ?`, [campaign.id]);

      await auditLog({
        entityType: 'campaign',
        entityId: campaign.id,
        action: 'deactivate',
        actor: 'system:expiry-job',
        changes: { active: { from: true, to: false }, reason: 'endDate passed' },
      });

      logger.info(`Auto-deactivated expired campaign ${campaign.id}`);

      // Optional: Call on-chain set_active(false) if contract linked
      if (campaign.campaignContractId && process.env.STELLAR_ADMIN_KEY) {
        try {
          // TODO: Implement Stellar contract call
          logger.info(`Would call set_active(false) for contract ${campaign.campaignContractId}`);
        } catch (err) {
          logger.error(`Failed to deactivate contract ${campaign.campaignContractId}:`, err);
        }
      }
    }

    if (expiredCampaigns.rows.length > 0) {
      logger.info(`Deactivated ${expiredCampaigns.rows.length} expired campaigns`);
    }
  } catch (err) {
    logger.error('Campaign expiry check failed:', err);
  }
}

module.exports = { checkExpiredCampaigns, EXPIRY_CHECK_INTERVAL_MS };
```

Update `backend/src/jobs/jobRunner.js` to register the job.

---

## Issue #336: GraphQL API Layer

### Implementation

1. Install dependencies:

```bash
npm install graphql graphql-yoga dataloader
```

2. Create `backend/src/graphql/schema.js`:

```javascript
const { createSchema } = require('graphql-yoga');

module.exports = createSchema({
  typeDefs: `
    type Campaign {
      id: ID!
      name: String!
      description: String
      active: Boolean!
      endDate: String
      stats: CampaignStats
      auditLogs(limit: Int): [AuditLog!]!
    }

    type CampaignStats {
      totalParticipants: Int!
      totalRewards: String!
    }

    type AuditLog {
      id: ID!
      action: String!
      actor: String!
      timestamp: String!
    }

    type Query {
      campaigns(filter: CampaignFilter, limit: Int, cursor: String): CampaignConnection!
      campaign(id: ID!): Campaign
    }

    input CampaignFilter {
      active: Boolean
      search: String
    }

    type CampaignConnection {
      edges: [CampaignEdge!]!
      pageInfo: PageInfo!
    }

    type CampaignEdge {
      node: Campaign!
      cursor: String!
    }

    type PageInfo {
      hasNextPage: Boolean!
      endCursor: String
    }

    type Mutation {
      createCampaign(input: CreateCampaignInput!): Campaign!
      updateCampaign(id: ID!, input: UpdateCampaignInput!): Campaign!
    }

    input CreateCampaignInput {
      name: String!
      description: String
      endDate: String
    }

    input UpdateCampaignInput {
      name: String
      description: String
      active: Boolean
      endDate: String
    }
  `,
  resolvers: {
    // Implement resolvers with DataLoader for batching
  },
});
```

3. Mount GraphQL in `backend/src/index.js`

---

## Issue #337: GDPR Data Export/Deletion

### Implementation

Create `backend/src/services/gdprService.js`:

```javascript
const db = require('../db');
const crypto = require('crypto');
const { auditLog } = require('../dal/auditLogRepository');

async function exportUserData(walletAddress) {
  const auditLogs = await db.query(`SELECT * FROM audit_log WHERE actor = ?`, [walletAddress]);

  const campaigns = await db.query(`SELECT * FROM campaigns WHERE createdBy = ?`, [walletAddress]);

  return {
    walletAddress,
    exportDate: new Date().toISOString(),
    auditLogs: auditLogs.rows,
    campaigns: campaigns.rows,
  };
}

async function deleteUserData(walletAddress) {
  const hash = crypto.createHash('sha256').update(walletAddress).digest('hex');
  const redacted = `[REDACTED:${hash.substring(0, 8)}]`;

  await db.query(`UPDATE audit_log SET actor = ? WHERE actor = ?`, [redacted, walletAddress]);

  await db.query(`UPDATE campaigns SET createdBy = ? WHERE createdBy = ?`, [
    redacted,
    walletAddress,
  ]);

  await auditLog({
    entityType: 'user',
    entityId: redacted,
    action: 'gdpr_deletion',
    actor: 'system:gdpr',
    changes: { walletAddress: 'redacted' },
  });

  return { success: true, redactedAs: redacted };
}

module.exports = { exportUserData, deleteUserData };
```

Add routes in `backend/src/index.js`:

```javascript
app.get('/api/v1/user/:walletAddress/export', rateLimiter, async (req, res) => {
  // Verify wallet signature
  const data = await exportUserData(req.params.walletAddress);
  res.setHeader('Content-Disposition', 'attachment; filename=user-data.json');
  res.json(data);
});

app.delete('/api/v1/user/:walletAddress', rateLimiter, async (req, res) => {
  // Verify wallet signature
  const result = await deleteUserData(req.params.walletAddress);
  res.json(result);
});
```

---

## Issue #329: Campaign Rewards Multiplier

### Implementation

Update `contracts/rewards/src/lib.rs`:

```rust
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct RewardsContract;

#[contractimpl]
impl RewardsContract {
    /// Set campaign multiplier using contract Address instead of u64
    pub fn set_campaign_multiplier(
        env: Env,
        admin: Address,
        campaign_contract: Address,
        multiplier_bps: u32
    ) {
        admin.require_auth();

        // Store multiplier keyed by campaign contract address
        env.storage().instance().set(&campaign_contract, &multiplier_bps);
    }

    /// Get campaign multiplier
    pub fn campaign_multiplier(env: Env, campaign_contract: Address) -> u32 {
        env.storage()
            .instance()
            .get(&campaign_contract)
            .unwrap_or(10000) // Default 1.0x (100%)
    }

    /// Credit rewards with campaign validation
    pub fn credit_for_campaign(
        env: Env,
        from: Address,
        user: Address,
        campaign_contract: Address,
        base_amount: i128
    ) -> i128 {
        from.require_auth();

        // Cross-contract call to verify campaign is active
        let campaign_client = CampaignContractClient::new(&env, &campaign_contract);
        let is_active = campaign_client.is_active();

        if !is_active {
            panic!("Campaign is not active");
        }

        let multiplier_bps = Self::campaign_multiplier(env.clone(), campaign_contract.clone());
        let final_amount = (base_amount * multiplier_bps as i128) / 10000;

        // Credit user
        // ... existing credit logic

        final_amount
    }
}
```

**Breaking Change**: Update all frontend calls to use `Address` instead of `u64` for campaign_id.

---

## Testing

Each implementation requires:

- Unit tests
- Integration tests
- Manual testing

## Deployment

1. Run database migrations if needed
2. Update environment variables
3. Deploy backend changes
4. Deploy contract changes (with migration plan for #329)

## Documentation

Update:

- API documentation
- Contract documentation
- Deployment guides
- CHANGELOG.md

---

**Status**: Implementation guidance complete. Ready for development.
