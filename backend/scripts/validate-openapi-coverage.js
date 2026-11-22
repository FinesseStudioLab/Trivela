#!/usr/bin/env node
/**
 * OpenAPI Spec Coverage Validator
 *
 * Validates that all routes defined in the Express application are documented
 * in the OpenAPI spec. Fails CI if routes are missing or spec has drifted.
 *
 * Usage: node backend/scripts/validate-openapi-coverage.js
 *
 * Exit codes:
 *   0 - All routes covered, spec is valid
 *   1 - Missing routes or validation errors
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load OpenAPI spec
const specPath = resolve(__dirname, '../openapi.yaml');
const specContent = readFileSync(specPath, 'utf8');
const spec = YAML.parse(specContent);

// Extract routes from index.js by parsing the file
const indexPath = resolve(__dirname, '../src/index.js');
const indexContent = readFileSync(indexPath, 'utf8');

/**
 * Extract all route definitions from the Express application
 * Matches patterns like: app.get('/path', ...), app.post(`${prefix}/path`, ...)
 */
function extractRoutesFromCode(code) {
  const routes = [];
  
  // Pattern: app.METHOD(path, ...)
  const routePattern = /app\.(get|post|put|patch|delete)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
  let match;
  
  while ((match = routePattern.exec(code)) !== null) {
    const method = match[1].toUpperCase();
    let path = match[2];
    
    // Handle template literals with ${prefix}
    path = path.replace(/\$\{prefix\}/g, '/v1');
    
    // Normalize path parameters from Express :param to OpenAPI {param}
    path = path.replace(/:(\w+)/g, '{$1}');
    
    routes.push({ method, path });
  }
  
  return routes;
}

/**
 * Extract all routes defined in OpenAPI spec
 */
function extractRoutesFromSpec(spec) {
  const routes = [];
  
  if (!spec.paths) {
    return routes;
  }
  
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (pathItem[method]) {
        routes.push({
          method: method.toUpperCase(),
          path: path,
        });
      }
    }
  }
  
  return routes;
}

/**
 * Normalize paths for comparison
 */
function normalizePath(path) {
  // Remove trailing slash
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * Check if a route is covered in the spec
 */
function isRouteCovered(route, specRoutes) {
  const normalizedPath = normalizePath(route.path);
  
  return specRoutes.some(specRoute => {
    return (
      specRoute.method === route.method &&
      normalizePath(specRoute.path) === normalizedPath
    );
  });
}

/**
 * Routes that are intentionally excluded from the OpenAPI spec
 * (internal health checks, metrics, probes, etc.)
 */
const EXCLUDED_ROUTES = [
  'GET /health',
  'GET /health/live',
  'GET /health/ready',
  'GET /health/rpc',
  'GET /health/indexer',
  'GET /livez',
  'GET /readyz',
  'GET /healthz',
  'GET /ready',
  'GET /metrics',
  'GET /__dev__/test-error',
  'GET /__dev__/test-timeout',
];

/**
 * Check if a route should be excluded from validation
 */
function isExcluded(route) {
  const routeKey = `${route.method} ${route.path}`;
  return EXCLUDED_ROUTES.includes(routeKey) || route.path.startsWith('/__dev__');
}

// Main validation
console.log('🔍 Validating OpenAPI spec coverage...\n');

// Validate spec structure
if (!spec.openapi) {
  console.error('❌ ERROR: Invalid OpenAPI spec - missing "openapi" field');
  process.exit(1);
}

if (!spec.info || !spec.info.title) {
  console.error('❌ ERROR: Invalid OpenAPI spec - missing "info.title" field');
  process.exit(1);
}

if (!spec.paths || Object.keys(spec.paths).length === 0) {
  console.error('❌ ERROR: OpenAPI spec has no paths defined');
  process.exit(1);
}

console.log(`✅ OpenAPI version: ${spec.openapi}`);
console.log(`✅ API title: ${spec.info.title}`);
console.log(`✅ API version: ${spec.info.version}\n`);

// Extract routes
const codeRoutes = extractRoutesFromCode(indexContent);
const specRoutes = extractRoutesFromSpec(spec);

console.log(`📝 Routes in code: ${codeRoutes.length}`);
console.log(`📝 Routes in spec: ${specRoutes.length}`);
console.log(`📝 Excluded routes: ${EXCLUDED_ROUTES.length}\n`);

// Find missing routes
const missingRoutes = codeRoutes.filter(route => {
  if (isExcluded(route)) {
    return false;
  }
  return !isRouteCovered(route, specRoutes);
});

// Find extra routes (in spec but not in code - might indicate stale spec)
const extraRoutes = specRoutes.filter(specRoute => {
  return !codeRoutes.some(codeRoute => {
    return (
      codeRoute.method === specRoute.method &&
      normalizePath(codeRoute.path) === normalizePath(specRoute.path)
    );
  });
});

// Report results
let hasErrors = false;

if (missingRoutes.length > 0) {
  hasErrors = true;
  console.error('❌ MISSING ROUTES IN OPENAPI SPEC:\n');
  missingRoutes.forEach(route => {
    console.error(`   ${route.method} ${route.path}`);
  });
  console.error('');
}

if (extraRoutes.length > 0) {
  console.warn('⚠️  ROUTES IN SPEC BUT NOT IN CODE (possibly stale):\n');
  extraRoutes.forEach(route => {
    console.warn(`   ${route.method} ${route.path}`);
  });
  console.warn('');
}

// Validate that spec has schemas for common models
const requiredSchemas = [
  'Campaign',
  'User',
  'Error',
  'PaginatedResponse',
];

const missingSchemas = requiredSchemas.filter(schema => {
  return !spec.components?.schemas?.[schema];
});

if (missingSchemas.length > 0) {
  console.warn('⚠️  RECOMMENDED SCHEMAS MISSING:\n');
  missingSchemas.forEach(schema => {
    console.warn(`   ${schema}`);
  });
  console.warn('');
}

// Validate that all paths have operation IDs (for code generation)
const pathsWithoutOperationId = [];
for (const [path, pathItem] of Object.entries(spec.paths || {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    if (pathItem[method] && !pathItem[method].operationId) {
      pathsWithoutOperationId.push(`${method.toUpperCase()} ${path}`);
    }
  }
}

if (pathsWithoutOperationId.length > 0) {
  console.warn('⚠️  PATHS WITHOUT OPERATION IDs (affects code generation):\n');
  pathsWithoutOperationId.slice(0, 10).forEach(path => {
    console.warn(`   ${path}`);
  });
  if (pathsWithoutOperationId.length > 10) {
    console.warn(`   ... and ${pathsWithoutOperationId.length - 10} more\n`);
  } else {
    console.warn('');
  }
}

// Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (hasErrors) {
  console.error('❌ VALIDATION FAILED: OpenAPI spec is incomplete\n');
  console.error('Please add the missing routes to backend/openapi.yaml\n');
  process.exit(1);
} else {
  console.log('✅ VALIDATION PASSED: All routes are documented\n');
  
  if (extraRoutes.length > 0 || pathsWithoutOperationId.length > 0) {
    console.log('⚠️  Some warnings were found (see above)\n');
  }
  
  process.exit(0);
}
