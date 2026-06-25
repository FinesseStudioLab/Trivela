/**
 * Campaign templates route — /api/templates
 *
 * GET  /api/templates          — List all template summaries
 * GET  /api/templates/:id      — Get a single template with full config
 * POST /api/templates/:id/clone — Clone a template into a campaign config
 * POST /api/templates/save      — Save an existing campaign as a template
 */

import { Router } from 'express';
import {
  getTemplateCatalog,
  getTemplateById,
  cloneTemplate,
  saveAsTemplate,
} from '../services/campaignTemplates.js';

export function createTemplateRoutes() {
  const router = Router();

  // List all templates
  router.get('/', (_req, res) => {
    res.json({ templates: getTemplateCatalog() });
  });

  // Get single template
  router.get('/:id', (req, res) => {
    const template = getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
  });

  // Clone a template
  router.post('/:id/clone', (req, res) => {
    const result = cloneTemplate(req.params.id, req.body);
    if (!result.valid) {
      return res.status(400).json({ errors: result.errors });
    }
    res.json({ config: result.config });
  });

  // Save campaign as template
  router.post('/save', (req, res) => {
    const { campaign } = req.body;
    if (!campaign) {
      return res.status(400).json({ error: 'Campaign object is required' });
    }
    const template = saveAsTemplate(campaign);
    res.status(201).json({ template });
  });

  return router;
}
