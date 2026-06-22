import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import SwaggerParser from '@readme/openapi-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function validateOpenApiSpec() {
  const specPath = join(__dirname, '..', 'openapi.yaml');

  try {
    console.log('Validating OpenAPI spec...');
    const api = await SwaggerParser.validate(specPath);
    console.log('✓ OpenAPI spec is valid');
    console.log(`  API: ${api.info.title} v${api.info.version}`);
    console.log(`  Paths: ${Object.keys(api.paths).length}`);
    console.log(`  Schemas: ${Object.keys(api.components?.schemas || {}).length}`);
    process.exit(0);
  } catch (error) {
    console.error('✗ OpenAPI spec validation failed:');
    console.error(error.message);
    process.exit(1);
  }
}

validateOpenApiSpec();
