// @ts-check
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument, loadOpenApiSpec } from '../services/openapiGenerator.js';

/**
 * Interactive REST API documentation (#1259), mounted at `/docs/api`.
 *
 *   GET /docs/api                Swagger UI
 *   GET /docs/api/openapi.json   the generated OpenAPI 3.0 document
 *
 * The document is generated once at startup from `openapi.yaml` plus the Zod
 * request schemas, and cached.
 *
 * @param {{ baseSpec?: Record<string, any> }} [options] defaults to `backend/openapi.yaml`
 */
export function createApiDocsRouter({ baseSpec } = {}) {
  const router = Router();
  const hasPaths = baseSpec?.paths && Object.keys(baseSpec.paths).length > 0;
  const document = buildOpenApiDocument({ baseSpec: hasPaths ? baseSpec : loadOpenApiSpec() });

  router.get('/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(document);
  });

  router.use('/', swaggerUi.serve);
  router.get(
    '/',
    swaggerUi.setup(document, {
      customSiteTitle: 'Trivela REST API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'list', filter: true },
    }),
  );

  return router;
}
