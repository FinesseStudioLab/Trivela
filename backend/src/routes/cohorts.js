// @ts-check
import express from 'express';
import { z } from 'zod';

/**
 * Cohort and retention analysis API routes
 * @param {object} params
 * @param {ReturnType<import('../services/cohortService.js').createCohortService>} params.cohortService
 * @param {ReturnType<import('../dal/sqliteCampaignRepository.js').createSqliteCampaignRepository>} params.campaignRepo
 */
export function createCohortRoutes({ cohortService, campaignRepo }) {
  const router = express.Router();

  // Validation schemas
  const granularitySchema = z.enum(['day', 'week', 'month']);
  const metricTypeSchema = z.enum(['claimed', 'active']);

  const cohortAnalysisQuerySchema = z.object({
    granularity: granularitySchema.optional().default('week'),
    metric: metricTypeSchema.optional().default('claimed'),
    recompute: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  });

  const retentionCurveQuerySchema = z.object({
    granularity: granularitySchema.optional().default('week'),
    metric: metricTypeSchema.optional().default('claimed'),
  });

  const recordActivitySchema = z.object({
    userAddress: z.string().min(1),
    activityType: z.enum(['registered', 'claimed', 'active']),
    occurredAt: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  /**
   * GET /api/v1/campaigns/:campaignId/cohorts
   * Get cohort analysis with retention curves
   */
  router.get('/:campaignId/cohorts', async (req, res, next) => {
    try {
      const campaignId = Number(req.params.campaignId);

      // Verify campaign exists
      const campaign = campaignRepo.getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Parse and validate query params
      const query = cohortAnalysisQuerySchema.parse(req.query);

      // Get cohort analysis
      const analysis = await cohortService.getCohortAnalysis(
        campaignId,
        query.granularity,
        query.metric,
        { recompute: query.recompute },
      );

      res.json({
        campaignId,
        granularity: query.granularity,
        metricType: query.metric,
        cohorts: analysis,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: err.errors,
        });
      }
      next(err);
    }
  });

  /**
   * GET /api/v1/campaigns/:campaignId/cohorts/:cohortPeriod/retention
   * Get retention curve for a specific cohort
   */
  router.get('/:campaignId/cohorts/:cohortPeriod/retention', async (req, res, next) => {
    try {
      const campaignId = Number(req.params.campaignId);
      const { cohortPeriod } = req.params;

      // Verify campaign exists
      const campaign = campaignRepo.getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Parse and validate query params
      const query = retentionCurveQuerySchema.parse(req.query);

      // Get retention curve
      const curve = await cohortService.getRetentionCurve(
        campaignId,
        cohortPeriod,
        query.granularity,
        query.metric,
      );

      res.json(curve);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: err.errors,
        });
      }
      if (err.message && err.message.includes('Cohort not found')) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * POST /api/v1/campaigns/:campaignId/cohorts/recompute
   * Force recomputation of cohort and retention data
   */
  router.post('/:campaignId/cohorts/recompute', async (req, res, next) => {
    try {
      const campaignId = Number(req.params.campaignId);

      // Verify campaign exists
      const campaign = campaignRepo.getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const query = cohortAnalysisQuerySchema.parse(req.query);

      // Recompute
      await cohortService.computeCohorts(campaignId, query.granularity, query.metric);

      res.json({
        success: true,
        message: 'Cohort data recomputed successfully',
        campaignId,
        granularity: query.granularity,
        metricType: query.metric,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: err.errors,
        });
      }
      next(err);
    }
  });

  /**
   * POST /api/v1/campaigns/:campaignId/activities
   * Record a user activity (for testing and manual data entry)
   */
  router.post('/:campaignId/activities', async (req, res, next) => {
    try {
      const campaignId = Number(req.params.campaignId);

      // Verify campaign exists
      const campaign = campaignRepo.getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Validate request body
      const data = recordActivitySchema.parse(req.body);

      // Record activity based on type
      let result;
      switch (data.activityType) {
        case 'registered':
          result = cohortService.recordRegistration(
            campaignId,
            data.userAddress,
            data.occurredAt,
            data.metadata,
          );
          break;
        case 'claimed':
          result = cohortService.recordClaim(
            campaignId,
            data.userAddress,
            data.occurredAt,
            data.metadata,
          );
          break;
        case 'active':
          result = cohortService.recordActive(
            campaignId,
            data.userAddress,
            data.occurredAt,
            data.metadata,
          );
          break;
      }

      res.status(201).json({
        success: true,
        message: `Activity '${data.activityType}' recorded for user ${data.userAddress}`,
        activityId: result.lastInsertRowid,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: err.errors,
        });
      }
      next(err);
    }
  });

  return router;
}
