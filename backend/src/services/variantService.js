// @ts-check

/**
 * Hash function for consistent variant assignment based on user ID
 * @param {string} str
 * @returns {number}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Selects a variant based on traffic weights
 * @param {Array<{id: string, trafficWeight: number}>} variants
 * @param {string} userId
 * @returns {string} variantId
 */
function selectVariantByWeight(variants, userId) {
  // Calculate total weight
  const totalWeight = variants.reduce((sum, v) => sum + v.trafficWeight, 0);

  if (totalWeight === 0) {
    // If no weights, return first variant
    return variants[0]?.id || '';
  }

  // Use hash of userId to deterministically select variant
  const hash = simpleHash(userId);
  const selection = hash % totalWeight;

  let cumulativeWeight = 0;
  for (const variant of variants) {
    cumulativeWeight += variant.trafficWeight;
    if (selection < cumulativeWeight) {
      return variant.id;
    }
  }

  // Fallback to first variant
  return variants[0]?.id || '';
}

/**
 * Validates that traffic weights sum to 100 or less
 * @param {Array<{trafficWeight: number}>} variants
 * @throws {Error} if weights are invalid
 */
function validateTrafficWeights(variants) {
  // First check individual weights
  for (const variant of variants) {
    if (variant.trafficWeight < 0 || variant.trafficWeight > 100) {
      throw new Error(`Traffic weight must be between 0 and 100, got ${variant.trafficWeight}`);
    }
  }

  // Then check total
  const totalWeight = variants.reduce((sum, v) => sum + v.trafficWeight, 0);
  if (totalWeight > 100) {
    throw new Error(`Total traffic weight (${totalWeight}%) exceeds 100%`);
  }
}

/**
 * Creates a variant service with business logic for A/B testing
 * @param {object} params
 * @param {ReturnType<import('../dal/sqliteVariantRepository.js').createSqliteVariantRepository>} params.variantRepo
 */
export function createVariantService({ variantRepo }) {
  /**
   * Assigns a user to a variant for a campaign
   * @param {string} campaignId
   * @param {string} userId
   * @param {boolean} [sticky=true] - Whether assignment should be persistent
   * @returns {Promise<{variantId: string, variantKey: string, isNewAssignment: boolean}>}
   */
  async function assignVariant(campaignId, userId, sticky = true) {
    // Check for existing assignment
    const existing = variantRepo.getUserAssignment(campaignId, userId);
    if (existing && existing.sticky) {
      const variant = variantRepo.getVariantById(existing.variantId);
      return {
        variantId: existing.variantId,
        variantKey: variant?.variantKey || '',
        isNewAssignment: false,
      };
    }

    // Get active variants for the campaign
    const variants = variantRepo.listVariantsByCampaign(campaignId, { activeOnly: true });

    if (variants.length === 0) {
      throw new Error(`No active variants found for campaign ${campaignId}`);
    }

    // Validate weights
    validateTrafficWeights(variants);

    // Select variant based on weights
    const selectedVariantId = selectVariantByWeight(variants, userId);
    const selectedVariant = variants.find((v) => v.id === selectedVariantId);

    if (!selectedVariant) {
      throw new Error('Failed to select variant');
    }

    // Create assignment
    variantRepo.assignUserToVariant({
      campaignId,
      variantId: selectedVariantId,
      userId,
      sticky,
    });

    return {
      variantId: selectedVariantId,
      variantKey: selectedVariant.variantKey,
      isNewAssignment: true,
    };
  }

  /**
   * Gets the variant assigned to a user
   * @param {string} campaignId
   * @param {string} userId
   * @returns {{variantId: string, variantKey: string} | null}
   */
  function getUserVariant(campaignId, userId) {
    const assignment = variantRepo.getUserAssignment(campaignId, userId);
    if (!assignment) {
      return null;
    }

    const variant = variantRepo.getVariantById(assignment.variantId);
    if (!variant) {
      return null;
    }

    return {
      variantId: assignment.variantId,
      variantKey: variant.variantKey,
    };
  }

  /**
   * Records a metric result for a variant
   * @param {object} params
   * @param {string} params.campaignId
   * @param {string} params.userId
   * @param {string} params.metricName
   * @param {number} params.metricValue
   * @param {object} [params.metadata]
   */
  async function trackResult({ campaignId, userId, metricName, metricValue, metadata = {} }) {
    // Get user's variant assignment
    const assignment = variantRepo.getUserAssignment(campaignId, userId);
    if (!assignment) {
      throw new Error(`User ${userId} is not assigned to any variant in campaign ${campaignId}`);
    }

    return variantRepo.recordResult({
      campaignId,
      variantId: assignment.variantId,
      metricName,
      metricValue,
      userId,
      metadata,
    });
  }

  /**
   * Gets comprehensive results for a campaign's experiment
   * @param {string} campaignId
   * @param {string} metricName
   */
  function getExperimentResults(campaignId, metricName) {
    const stats = variantRepo.getResultStats(campaignId, metricName);
    const assignments = variantRepo.getAssignmentStats(campaignId);

    // Merge stats and assignments
    return stats.map((stat) => {
      const assignmentData = assignments.find((a) => a.variantId === stat.variantId) || {};
      return {
        ...stat,
        assignmentCount: assignmentData.assignmentCount || 0,
      };
    });
  }

  /**
   * Calculates basic significance test (z-test for proportions)
   * @param {object} control
   * @param {number} control.sampleCount
   * @param {number} control.mean
   * @param {object} variant
   * @param {number} variant.sampleCount
   * @param {number} variant.mean
   * @returns {{pValue: number, isSignificant: boolean, improvement: number, zScore: number}}
   */
  function calculateSignificance(control, variant) {
    if (control.sampleCount === 0 || variant.sampleCount === 0) {
      return {
        pValue: 1,
        isSignificant: false,
        improvement: 0,
        zScore: 0,
      };
    }

    const p1 = control.mean;
    const n1 = control.sampleCount;
    const p2 = variant.mean;
    const n2 = variant.sampleCount;

    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

    const zScore = se > 0 ? (p2 - p1) / se : 0;
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

    const improvement = control.mean > 0 ? ((variant.mean - control.mean) / control.mean) * 100 : 0;

    return {
      pValue,
      isSignificant: pValue < 0.05,
      improvement,
      zScore,
    };
  }

  /**
   * Approximation of normal CDF (cumulative distribution function)
   * @param {number} x
   * @returns {number}
   */
  function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp((-x * x) / 2);
    const prob =
      d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  return {
    assignVariant,
    getUserVariant,
    trackResult,
    getExperimentResults,
    calculateSignificance,
    validateTrafficWeights,
  };
}
