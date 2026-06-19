// @ts-check
/**
 * Backend input sanitization utilities.
 * Provides functions for HTML entity escaping, log injection prevention,
 * and URL parameter escaping to prevent XSS and log injection attacks.
 *
 * @module sanitizer
 */

import validator from 'validator';

/**
 * HTML escape unsafe characters to prevent HTML injection.
 * Escapes <, >, &, ", and ' characters.
 *
 * @param {string} str - String to escape
 * @returns {string} HTML-escaped string
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(str) {
  return validator.escape(str);
}

/**
 * Sanitize values for safe logging.
 * Removes newlines, carriage returns, and ANSI escape codes that could
 * be used for log injection attacks (CWE-117).
 *
 * @param {string} value - Log value to sanitize
 * @returns {string} Sanitized value safe for logging
 *
 * @example
 * const cleanLog = sanitizeForLog(userInput);
 * log.info({ user: cleanLog });
 */
export function sanitizeForLog(value) {
  if (typeof value !== 'string') {
    return String(value);
  }

  return value
    .replace(/[\r\n]/g, ' ') // Remove newlines and carriage returns
    .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI escape codes
    .replace(/\x00/g, ''); // Remove null bytes
}

/**
 * Sanitize URL parameters that appear in error messages.
 * Prevents reflected XSS through URL params in error responses.
 *
 * @param {string} param - URL parameter value
 * @returns {string} Sanitized parameter safe for inclusion in error messages
 *
 * @example
 * const slug = sanitizeUrlParam(req.params.slug);
 * if (!campaign) {
 *   return res.status(404).json({ error: `Campaign ${slug} not found` });
 * }
 */
export function sanitizeUrlParam(param) {
  if (typeof param !== 'string') {
    return '';
  }

  // Remove null bytes and control characters
  let clean = param.replace(/[\x00-\x1f\x7f]/g, '');

  // HTML escape to prevent injection
  clean = escapeHtml(clean);

  // Limit length to prevent DOS
  return clean.substring(0, 255);
}

/**
 * Validate and sanitize a campaign slug.
 * Ensures it matches expected format and contains no injection payloads.
 *
 * @param {string} slug - Campaign slug to validate
 * @returns {string|null} Sanitized slug or null if invalid
 *
 * @example
 * const validSlug = validateSlug(userInput);
 * if (!validSlug) {
 *   return res.status(400).json({ error: 'Invalid slug format' });
 * }
 */
export function validateSlug(slug) {
  if (typeof slug !== 'string') {
    return null;
  }

  // Should be lowercase alphanumeric with hyphens only
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!slugRegex.test(slug)) {
    return null;
  }

  return slug.toLowerCase();
}

/**
 * Sanitize campaign metadata (name, description, tags).
 * Trims whitespace, removes null bytes, and HTML-escapes content.
 *
 * @param {string} value - Campaign metadata value
 * @param {number} maxLength - Maximum allowed length (default 500)
 * @returns {string} Sanitized value
 *
 * @example
 * const cleanName = sanitizeCampaignMetadata(name);
 */
export function sanitizeCampaignMetadata(value, maxLength = 500) {
  if (typeof value !== 'string') {
    return '';
  }

  // Trim and remove null bytes
  let clean = value.trim().replace(/\x00/g, '');

  // Limit to max length
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }

  // HTML escape special characters
  return escapeHtml(clean);
}

/**
 * Create a safe error message that doesn't reflect unsanitized user input.
 * Useful for API error responses.
 *
 * @param {string} message - Error message template (safe)
 * @param {Record<string, string>} params - Parameters to substitute (will be escaped)
 * @returns {string} Safe error message
 *
 * @example
 * const errorMsg = createSafeErrorMessage(
 *   'Campaign "{slug}" not found',
 *   { slug: userSlug }
 * );
 */
export function createSafeErrorMessage(message, params = {}) {
  let result = message;

  for (const [key, value] of Object.entries(params)) {
    const safeValue = sanitizeUrlParam(String(value));
    result = result.replace(`{${key}}`, safeValue);
  }

  return result;
}

/**
 * Sanitize an entire object recursively.
 * Useful for logging or error reporting with user-supplied data.
 *
 * @param {unknown} obj - Object to sanitize
 * @param {Set<unknown>} seen - Seen objects (for cycle detection)
 * @returns {unknown} Sanitized object
 *
 * @example
 * const cleanData = sanitizeObject(userData);
 * log.info({ data: cleanData });
 */
export function sanitizeObject(obj, seen = new Set()) {
  // Handle primitives
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeForLog(obj) : obj;
  }

  // Detect cycles
  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, seen));
  }

  // Handle objects
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize both keys and values
    const safeKey = sanitizeForLog(String(key));
    sanitized[safeKey] = sanitizeObject(value, seen);
  }

  return sanitized;
}

export default {
  escapeHtml,
  sanitizeForLog,
  sanitizeUrlParam,
  validateSlug,
  sanitizeCampaignMetadata,
  createSafeErrorMessage,
  sanitizeObject,
};
