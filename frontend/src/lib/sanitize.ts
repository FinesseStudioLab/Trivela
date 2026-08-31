/**
 * Sanitization utilities using DOMPurify.
 * Provides safe HTML sanitization for scenarios where user-supplied content
 * needs to be rendered. Default configuration strips all HTML tags.
 *
 * @module sanitize
 */

import DOMPurify from 'dompurify';

/**
 * Default sanitization configuration: strips all HTML tags.
 * Safe for campaign descriptions, user-supplied text fields.
 */
const DEFAULT_CONFIG = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
};

/**
 * Sanitization configuration for rich text: allows basic formatting.
 * Used only when HTML content is explicitly required.
 */
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'a', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

/**
 * Sanitize user-supplied text by stripping all HTML tags.
 * Use this for campaign names, descriptions, and other user input.
 *
 * @param {string} dirty - User-supplied input
 * @returns {string} Sanitized text without HTML
 *
 * @example
 * const campaignName = sanitizeText(userInput);
 * // "Exploit <script>alert('xss')</script>" → "Exploit alert('xss')"
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, DEFAULT_CONFIG);
}

/**
 * Sanitize campaign descriptions allowing safe formatting tags.
 * Use only when HTML formatting is explicitly required.
 *
 * @param {string} dirty - User-supplied HTML input
 * @returns {string} Sanitized HTML with safe tags only
 *
 * @example
 * const description = sanitizeRichText(userInput);
 * // "<p>Learn more <a href='...'>here</a></p>" → same (safe)
 * // "<p>Learn <script>alert('xss')</script> here</p>" → "<p>Learn here</p>"
 */
export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, RICH_TEXT_CONFIG);
}

/**
 * Validate and sanitize URL parameters to prevent injection attacks.
 * Ensures URLs don't contain encoded XSS payloads.
 *
 * @param {string} urlParam - URL parameter value
 * @returns {string} Safe URL parameter value
 *
 * @example
 * const campaignSlug = sanitizeUrlParam(slug);
 */
export function sanitizeUrlParam(urlParam: string): string {
  try {
    // Decode to catch double-encoded attacks
    const decoded = decodeURIComponent(urlParam);
    // Re-sanitize to remove any injected HTML
    return DOMPurify.sanitize(decoded, DEFAULT_CONFIG);
  } catch {
    // If decoding fails, return sanitized raw value
    return DOMPurify.sanitize(urlParam, DEFAULT_CONFIG);
  }
}

/**
 * Check if a string contains potential XSS payloads.
 * Useful for validation and logging suspicious activity.
 *
 * @param {string} value - Value to check
 * @returns {boolean} True if potential XSS payload detected
 *
 * @example
 * if (containsXSSPayload(userInput)) {
 *   log.warn('Potential XSS attempt detected');
 * }
 */
export function containsXSSPayload(value: string): boolean {
  const xssPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i, // onload=, onclick=, etc.
    /<iframe/i,
    /<embed/i,
    /<object/i,
  ];
  return xssPatterns.some((pattern) => pattern.test(value));
}

export default {
  sanitizeText,
  sanitizeRichText,
  sanitizeUrlParam,
  containsXSSPayload,
};
