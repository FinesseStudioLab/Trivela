// @ts-check
import express from 'express';
import {
  variantCreateSchema,
  variantUpdateSchema,
  variantAssignSchema,
  variantResultSchema,
  formatZodErrors,
} from '../schemas.js';

/**
 * Creates variant routes for A/B testing
 * @param {object} deps
 * @param {ReturnType<import('../dal/sqliteVariantRepository.js').createSqliteVariantRepository>} deps.variantRepo
 * @param {ReturnType<import('../services/variantService.js').createVariantService>} deps.variantService
 * @param {ReturnType<import('../dal/sqliteCampaignRepository.js').createSqliteCampaignRepository>} deps.campaignRepo
 */
export function createVariantRoutes({ variantRepo, variantService, campaignRepo }) {
  const router = express.Router();

  // Create a new variant for a campaign
  router.post('/campaigns/:campaignId/variants', async (req, res) => {
    try {
      const campaignId = req.params.campaignId;

      // Verify campaign exists
      const campaign = campaignRepo.getById(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Validate request body
      const validation = variantCreateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: formatZodErrors(validation.error),
        });
      }

      const data = validation.data;

      // Check if variant key already exists for this campaign
      const existing = variantRepo.getVariantByKey(campaignId, data.variantKey);
      if (existing) {
        return res.status(409).json({
          error: 'A variant with this key already exists for this campaign',
        });
      }

      // Create variant
      const variant = variantRepo.createVariant({
        campaignId,
        variantKey: data.variantKey,
        name: data.name,
        description: data.description,
        trafficWeight: data.trafficWeight,
        isControl: data.isControl,
        active: data.active,
        config: data.config,
      });

      res.status(201).json(variant);
    } catch (error) {
      console.error('Error creating variant:', error);
      res.status(500).json({
        error: 'Failed to create variant',
        message: error.message,
      });
    }
  });

  // List all variants for a campaign
  router.get('/campaigns/:campaignId/variants', async (req, res) => {
    try {
      const campaignId = req.params.campaignId;
      const activeOnly = req.query.active === 'true';

      // Verify campaign exists
      const campaign = campaignRepo.getById(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const variants = variantRepo.listVariantsByCampaign(campaignId, { activeOnly });

      res.json({
        data: variants,
        meta: {
          campaignId,
          count: variants.length,
        },
      });
    } catch (error) {
      console.error('Error listing variants:', error);
      res.status(500).json({
        error: 'Failed to list variants',
        message: error.message,
      });
    }
  });

  // Get a specific variant
  router.get('/campaigns/:campaignId/variants/:variantId', async (req, res) => {
    try {
      const { campaignId, variantId } = req.params;

      const variant = variantRepo.getVariantById(variantId);

      if (!variant || variant.campaignId !== campaignId) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      res.json(variant);
    } catch (error) {
      console.error('Error getting variant:', error);
      res.status(500).json({
        error: 'Failed to get variant',
        message: error.message,
      });
    }
  });

  // Update a variant
  router.put('/campaigns/:campaignId/variants/:variantId', async (req, res) => {
    try {
      const { campaignId, variantId } = req.params;

      // Verify variant exists and belongs to campaign
      const existing = variantRepo.getVariantById(variantId);
      if (!existing || existing.campaignId !== campaignId) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      // Validate request body
      const validation = variantUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: formatZodErrors(validation.error),
        });
      }

      const updated = variantRepo.updateVariant(variantId, validation.data);

      res.json(updated);
    } catch (error) {
      console.error('Error updating variant:', error);
      res.status(500).json({
        error: 'Failed to update variant',
        message: error.message,
      });
    }
  });

  // Delete a variant
  router.delete('/campaigns/:campaignId/variants/:variantId', async (req, res) => {
    try {
      const { campaignId, variantId } = req.params;

      // Verify variant exists and belongs to campaign
      const existing = variantRepo.getVariantById(variantId);
      if (!existing || existing.campaignId !== campaignId) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      const deleted = variantRepo.deleteVariant(variantId);

      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: 'Failed to delete variant' });
      }
    } catch (error) {
      console.error('Error deleting variant:', error);
      res.status(500).json({
        error: 'Failed to delete variant',
        message: error.message,
      });
    }
  });

  // Assign a user to a variant
  router.post('/campaigns/:campaignId/variants/assign', async (req, res) => {
    try {
      const campaignId = req.params.campaignId;

      // Validate request body
      const validation = variantAssignSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: formatZodErrors(validation.error),
        });
      }

      const { userId, sticky = true } = validation.data;

      // Assign variant
      const assignment = await variantService.assignVariant(campaignId, userId, sticky);

      res.json(assignment);
    } catch (error) {
      console.error('Error assigning variant:', error);
      res.status(500).json({
        error: 'Failed to assign variant',
        message: error.message,
      });
    }
  });

  // Get user's variant assignment
  router.get('/campaigns/:campaignId/variants/assignment/:userId', async (req, res) => {
    try {
      const { campaignId, userId } = req.params;

      const assignment = variantService.getUserVariant(campaignId, userId);

      if (!assignment) {
        return res.status(404).json({ error: 'No assignment found for this user' });
      }

      res.json(assignment);
    } catch (error) {
      console.error('Error getting assignment:', error);
      res.status(500).json({
        error: 'Failed to get assignment',
        message: error.message,
      });
    }
  });

  // Track a result/metric for a variant
  router.post('/campaigns/:campaignId/variants/results', async (req, res) => {
    try {
      const campaignId = req.params.campaignId;

      // Validate request body
      const validation = variantResultSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: formatZodErrors(validation.error),
        });
      }

      const data = validation.data;

      // Track result
      const result = await variantService.trackResult({
        campaignId,
        userId: data.userId,
        metricName: data.metricName,
        metricValue: data.metricValue,
        metadata: data.metadata,
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Error tracking result:', error);
      res.status(500).json({
        error: 'Failed to track result',
        message: error.message,
      });
    }
  });

  // Get experiment results and statistics
  router.get('/campaigns/:campaignId/variants/results/:metricName', async (req, res) => {
    try {
      const { campaignId, metricName } = req.params;

      const results = variantService.getExperimentResults(campaignId, metricName);

      // Calculate significance if there's a control variant
      const control = results.find((r) => r.variantKey === 'control');
      const enrichedResults = results.map((result) => {
        if (control && result.variantKey !== 'control' && result.sampleCount > 0) {
          const significance = variantService.calculateSignificance(control, result);
          return { ...result, significance };
        }
        return result;
      });

      res.json({
        campaignId,
        metricName,
        results: enrichedResults,
      });
    } catch (error) {
      console.error('Error getting results:', error);
      res.status(500).json({
        error: 'Failed to get results',
        message: error.message,
      });
    }
  });

  // Get assignment statistics
  router.get('/campaigns/:campaignId/variants/stats/assignments', async (req, res) => {
    try {
      const campaignId = req.params.campaignId;

      const stats = variantRepo.getAssignmentStats(campaignId);

      res.json({
        campaignId,
        stats,
      });
    } catch (error) {
      console.error('Error getting assignment stats:', error);
      res.status(500).json({
        error: 'Failed to get assignment stats',
        message: error.message,
      });
    }
  });

  return router;
}
