// @ts-check
import { formatZodErrors } from '../schemas.js';

/**
 * Validates incoming request payload against Zod schema.
 * Enforces explicit validation, type coercion, and uniform error responses.
 * Returns error boundaries with structured details for client debugging.
 *
 * Creates middleware to validate `req.body` against a Zod schema.
 * Returns uniform 400 error shape on validation failure:
 * { error: "Validation failed", code: "VALIDATION_ERROR", details: [...] }
 *
 * @param {import('zod').ZodSchema} schema
 * @param {Object} options
 * @param {number} [options.maxPayloadSize=10485760] - max payload size in bytes (default 10MB)
 */
export function validateBody(schema, options = {}) {
  const { maxPayloadSize = 10 * 1024 * 1024 } = options;

  return (req, res, next) => {
    if (!req.body) {
      req.body = {};
    }

    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > maxPayloadSize) {
      return res.status(413).json({
        error: 'Payload too large',
        code: 'PAYLOAD_TOO_LARGE',
        details: [{ field: 'body', message: `Payload exceeds ${maxPayloadSize} bytes` }],
      });
    }

    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
        code: issue.code,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details,
        messages: formatZodErrors(result.error),
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates query string parameters against Zod schema.
 * Enforces type coercion and boundary checking.
 *
 * Creates middleware to validate `req.query` against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
        code: issue.code,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details,
        messages: formatZodErrors(result.error),
      });
    }
    req.query = result.data;
    next();
  };
}

/**
 * Validates path parameters against Zod schema.
 * Enforces defensive checks and type validation on URL segments.
 *
 * Creates middleware to validate `req.params` against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
        code: issue.code,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details,
        messages: formatZodErrors(result.error),
      });
    }
    req.params = result.data;
    next();
  };
}
