// @ts-check
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { load as yamlLoad } from 'js-yaml';
import * as routeSchemas from '../schemas.js';
import { ADDITIONAL_PATHS } from './openapiRoutes.js';

/**
 * OpenAPI 3.0 document generator (#1259).
 *
 * The hand-written `openapi.yaml` stays the source of truth for paths. On top
 * of it this module derives component schemas from the Zod request schemas the
 * routes actually validate with (`schemas.js`), so documented request bodies
 * cannot drift from runtime validation. Hand-written components always win.
 */

/** @param {string} name e.g. `campaignCreateSchema` -> `CampaignCreate` */
export function schemaComponentName(name) {
  const base = name.replace(/Schema$/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Convert a Zod (v3) schema into an OpenAPI 3.0 schema object.
 * Unsupported constructs degrade to an unconstrained schema (`{}`) rather than
 * throwing, so documentation generation never breaks the server.
 *
 * @param {any} schema
 * @returns {Record<string, any>}
 */
export function zodToOpenApi(schema) {
  const def = schema?._def;
  if (!def) return {};

  switch (def.typeName) {
    case 'ZodString': {
      /** @type {Record<string, any>} */
      const out = { type: 'string' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min') out.minLength = check.value;
        else if (check.kind === 'max') out.maxLength = check.value;
        else if (check.kind === 'url') out.format = 'uri';
        else if (check.kind === 'email') out.format = 'email';
        else if (check.kind === 'uuid') out.format = 'uuid';
        else if (check.kind === 'datetime') out.format = 'date-time';
        else if (check.kind === 'regex') out.pattern = check.regex.source;
      }
      return out;
    }
    case 'ZodNumber': {
      /** @type {Record<string, any>} */
      const out = { type: 'number' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'int') out.type = 'integer';
        else if (check.kind === 'min') out.minimum = check.value;
        else if (check.kind === 'max') out.maximum = check.value;
      }
      return out;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodLiteral':
      return { type: typeof def.value, enum: [def.value] };
    case 'ZodEnum':
      return { type: 'string', enum: [...def.values] };
    case 'ZodNativeEnum':
      return { enum: Object.values(def.values) };
    case 'ZodArray': {
      /** @type {Record<string, any>} */
      const out = { type: 'array', items: zodToOpenApi(def.type) };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      return out;
    }
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      /** @type {Record<string, any>} */
      const properties = {};
      /** @type {string[]} */
      const required = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToOpenApi(value);
        if (!isOptional(value)) required.push(key);
      }
      /** @type {Record<string, any>} */
      const out = { type: 'object', properties };
      if (required.length) out.required = required;
      return out;
    }
    case 'ZodRecord':
      return { type: 'object', additionalProperties: zodToOpenApi(def.valueType) };
    case 'ZodUnion':
      return { oneOf: def.options.map(zodToOpenApi) };
    case 'ZodNullable':
      return { ...zodToOpenApi(def.innerType), nullable: true };
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodReadonly':
      return zodToOpenApi(def.innerType);
    case 'ZodEffects': // .refine() / .transform() / .preprocess()
      return zodToOpenApi(def.schema);
    default:
      return {};
  }
}

/** @param {any} schema */
function isOptional(schema) {
  return typeof schema?.isOptional === 'function' ? schema.isOptional() : false;
}

/**
 * Component schemas derived from every exported Zod schema in `schemas.js`.
 * @returns {Record<string, Record<string, any>>}
 */
export function generateComponentSchemas(source = routeSchemas) {
  /** @type {Record<string, Record<string, any>>} */
  const out = {};
  for (const [exportName, value] of Object.entries(source)) {
    if (!(value instanceof z.ZodType)) continue;
    const converted = zodToOpenApi(value);
    if (converted.type !== 'object') continue; // only document request bodies/queries
    out[schemaComponentName(exportName)] = {
      ...converted,
      'x-generated-from': `schemas.js#${exportName}`,
    };
  }
  return out;
}

/**
 * OpenAPI 3.1 dropped the `nullable` keyword in favour of JSON Schema type
 * unions (`type: ['string', 'null']`). Rewrite in place for 3.1 documents.
 *
 * @param {any} node
 * @returns {any} the same node, normalised
 */
function toNullableTypeUnions(node) {
  if (Array.isArray(node)) {
    node.forEach(toNullableTypeUnions);
  } else if (node && typeof node === 'object') {
    if (node.nullable === true && typeof node.type === 'string') node.type = [node.type, 'null'];
    if ('nullable' in node && typeof node.nullable === 'boolean') delete node.nullable;
    Object.values(node).forEach(toNullableTypeUnions);
  }
  return node;
}

/**
 * Merge the base spec with generated component schemas.
 *
 * @param {{ baseSpec: Record<string, any>, serverUrl?: string, generated?: Record<string, any>, additionalPaths?: Record<string, any> }} options
 * @returns {Record<string, any>} a new document; `baseSpec` is not mutated
 */
export function buildOpenApiDocument({
  baseSpec,
  serverUrl,
  generated = generateComponentSchemas(),
  additionalPaths = ADDITIONAL_PATHS,
}) {
  const doc = structuredClone(baseSpec ?? {});
  doc.openapi ??= '3.0.3';
  doc.info ??= { title: 'Trivela API', version: '0.0.0' };
  doc.paths ??= {};
  doc.components ??= {};
  doc.components.schemas ??= {};

  const is31 = String(doc.openapi).startsWith('3.1');
  const adapt = (/** @type {any} */ value) => {
    const copy = structuredClone(value);
    return is31 ? toNullableTypeUnions(copy) : copy;
  };

  for (const [name, schema] of Object.entries(generated)) {
    if (!(name in doc.components.schemas)) doc.components.schemas[name] = adapt(schema);
  }

  for (const [path, item] of Object.entries(additionalPaths)) {
    doc.paths[path] = { ...adapt(item), ...doc.paths[path] }; // hand-written operations win
  }

  if (serverUrl && !(Array.isArray(doc.servers) && doc.servers.length)) {
    doc.servers = [{ url: serverUrl }];
  }
  return doc;
}

/**
 * Load `backend/openapi.yaml` relative to this module, so the result does not
 * depend on the process working directory (repo root vs. `backend/`).
 *
 * @returns {Record<string, any>} the parsed spec, or a minimal empty document
 */
export function loadOpenApiSpec() {
  try {
    const path = new URL('../../openapi.yaml', import.meta.url);
    return /** @type {Record<string, any>} */ (yamlLoad(readFileSync(path, 'utf8')));
  } catch {
    return { openapi: '3.0.3', info: { title: 'Trivela API', version: '0.0.0' }, paths: {} };
  }
}
