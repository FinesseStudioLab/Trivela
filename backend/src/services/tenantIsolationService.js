import { logger } from '../lib/logger.js';

export function createTenantIsolationService({ campaignRepository }) {
  return {
    listByTenant(tenantId, options = {}) {
      const allCampaigns = campaignRepository.list({ ...options, limit: 10000 });
      return allCampaigns.filter((c) => c.tenant_id === tenantId || c.tenant_id === null);
    },

    getByTenant(campaignId, tenantId) {
      const campaign = campaignRepository.get(campaignId);
      if (!campaign) return null;
      if (campaign.tenant_id === tenantId || campaign.tenant_id === null) {
        return campaign;
      }
      logger.warn(
        { campaignId, tenantId, actualTenant: campaign.tenant_id },
        '[tenantIsolation] Unauthorized tenant access attempt',
      );
      return null;
    },

    assertTenantAccess(campaignId, tenantId) {
      const campaign = this.getByTenant(campaignId, tenantId);
      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found or access denied for tenant ${tenantId}`);
      }
      return campaign;
    },

    setTenantForCampaign(campaignId, tenantId) {
      const db = campaignRepository.db;
      if (!db) {
        logger.error('[tenantIsolation] Database instance not available');
        return;
      }
      const stmt = db.prepare('UPDATE campaigns SET tenant_id = ? WHERE id = ?');
      stmt.run(tenantId, campaignId);
    },
  };
}
