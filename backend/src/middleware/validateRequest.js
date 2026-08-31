// @ts-check
import { formatZodErrors } from '../schemas.js';

/**
 * Creates middleware to validate `req.body` against a Zod schema.
 * Returns uniform 400 error shape on validation failure:
 * { error: "Validation failed", code: "VALIDATION_ERROR", details: [...] }
 *
 * @param {import('zod').ZodSchema} schema
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
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
 * Creates middleware to validate `req.query` against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
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
 * Creates middleware to validate `req.params` against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
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
