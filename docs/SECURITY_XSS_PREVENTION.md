# XSS Prevention & Input Sanitization Implementation (#488)

## Overview

This document describes the XSS prevention and input sanitization hardening implemented for the
Trivela project. The implementation addresses campaign names, descriptions, tags, and all
user-supplied text that gets stored in SQLite and rendered in React.

## Implementation Summary

### 1. Frontend: DOMPurify Integration

#### Files Added/Modified

- **`frontend/package.json`**: Added `dompurify` v3.1.0 dependency
- **`frontend/src/lib/sanitize.ts`**: New sanitization wrapper module

#### Features

- **`sanitizeText()`**: Strips all HTML tags from user input (default for campaign
  names/descriptions)
- **`sanitizeRichText()`**: Allows safe formatting tags (`<b>`, `<i>`, `<strong>`, `<em>`, `<br>`,
  `<p>`, `<a>`, lists)
- **`sanitizeUrlParam()`**: Decodes and re-sanitizes URL parameters to prevent double-encoded
  attacks
- **`containsXSSPayload()`**: Detects common XSS patterns in input (for logging/validation)

#### No `dangerouslySetInnerHTML` Found

✅ Audit confirmed no instances of `dangerouslySetInnerHTML` in the codebase. Frontend relies on
React's default JSX escaping.

#### Usage Examples

```jsx
import { sanitizeText, sanitizeRichText } from './lib/sanitize';

// Campaign name - strip all HTML
const campaignName = sanitizeText(userInput);

// Campaign description with formatting support
const description = sanitizeRichText(userInput);

// URL parameters
const slug = sanitizeUrlParam(params.slug);
```

### 2. Backend: Input Sanitization & Log Injection Prevention

#### Files Added/Modified

- **`backend/package.json`**: Added `validator` v13.12.0 dependency
- **`backend/src/lib/sanitizer.js`**: New backend sanitization utilities
- **`backend/src/middleware/errorHandler.js`**: Updated to use sanitizer
- **`backend/scripts/security-audit.js`**: New security audit script

#### Sanitizer Functions

##### HTML Entity Escaping

- **`escapeHtml(str)`**: Escapes `<`, `>`, `&`, `"`, `'` using `validator.escape()`
- Prevents HTML injection in error messages and logs

##### Log Injection Prevention (CWE-117)

- **`sanitizeForLog(value)`**: Removes injection attack vectors:
  - Newlines (`\n`) and carriage returns (`\r`)
  - ANSI escape codes (`\x1b[...m`)
  - Null bytes (`\x00`)
- **`sanitizeObject(obj)`**: Recursively sanitizes objects for safe logging

##### URL Parameter Escaping

- **`sanitizeUrlParam(param)`**: Escapes and limits length to 255 chars
- Prevents reflected XSS in error messages like "Campaign `{slug}` not found"

##### Campaign Metadata Sanitization

- **`sanitizeCampaignMetadata(value, maxLength)`**: Trims, removes null bytes, HTML-escapes
- Default max length: 500 chars (can be customized)
- Used for campaign names, descriptions, tags

##### Safe Error Messages

- **`createSafeErrorMessage(template, params)`**: Substitutes escaped parameters
- Ensures user input in errors is always escaped

#### Usage Examples

```javascript
import {
  sanitizeCampaignMetadata,
  sanitizeForLog,
  sanitizeUrlParam,
  createSafeErrorMessage,
} from '../lib/sanitizer.js';

// Sanitize campaign input
const campaign = campaignRepository.create({
  name: sanitizeCampaignMetadata(req.body.name),
  description: sanitizeCampaignMetadata(req.body.description, 1000),
  tags: req.body.tags?.map((t) => sanitizeCampaignMetadata(t, 32)) || [],
});

// Safe logging
log.info({ user: sanitizeForLog(userId) });

// Safe error messages
return res.status(404).json({
  error: createSafeErrorMessage('Campaign "{slug}" not found', {
    slug: req.params.slug,
  }),
});
```

### 3. Backend: Error Handling Hardening

#### Error Handler (`middleware/errorHandler.js`)

- Sanitizes all error details before logging
- Prevents log injection attacks via error messages
- Sanitizes stack traces (non-production only)
- Uses safe error messages in responses

### 4. Existing Backend Input Validation

#### Zod Schema Validation

The backend already uses comprehensive Zod schemas (`backend/src/schemas.js`):

- ✅ **String trimming**: All string inputs trimmed
- ✅ **Regex validation**: Contract IDs, slugs validated against strict patterns
- ✅ **URL validation**: Image URLs validated
- ✅ **Length limits**: Tags max 32 chars, max 10 tags
- ✅ **Cross-field validation**: Date ranges validated

Current schemas do NOT require additional sanitization via the sanitizer module because:

1. Zod validation ensures format compliance
2. SQLite treats all input as data (no injection vectors)
3. React JSX output automatically escapes by default

However, the sanitizer is available for:

- **Logging**: Prevent log injection
- **Error messages**: Prevent reflected XSS
- **Rich text scenarios**: If HTML rendering is added in future

### 5. Security Audit Script

#### File: `backend/scripts/security-audit.js`

Automated security checks:

- Detects `eval()` or `Function()` constructor usage
- Flags unescaped `innerHTML` assignments
- Warns about unsanitized user data in responses
- Verifies proper use of sanitization/validation

#### Usage

```bash
# Run security audit
npm run security:xss

# Includes frontend lint check + backend security audit
```

### 6. CSP Nonce Support

CSP with inline script nonces (issue #40 referenced) is a separate concern:

- Requires CDN/build system integration
- Recommended for future hardening
- Would work alongside these sanitization measures

## Security Checklist

### Frontend ✅

- [x] No `dangerouslySetInnerHTML` usage
- [x] DOMPurify integrated for sanitization
- [x] URL parameters sanitized
- [x] React JSX default escaping leveraged
- [x] Security audit script added

### Backend ✅

- [x] HTML entity escaping for output
- [x] Log injection prevention (newlines, ANSI codes)
- [x] URL parameters escaped in error messages
- [x] Error handler uses sanitized values
- [x] Comprehensive Zod input validation
- [x] Security audit script created
- [x] Validator.js integrated

### Logging & Monitoring ✅

- [x] Sanitized logging in error handler
- [x] Recursive object sanitization for complex data
- [x] Log injection vectors removed
- [x] No sensitive data in logs

## Running Security Checks

### Frontend

```bash
cd frontend
npm run security:xss
```

### Backend

```bash
cd backend
npm run security:xss
```

### Full Stack

```bash
npm run security:xss  # From root (if npm workspace configured)
```

## Testing

### Unit Tests for Sanitization (Recommended)

Add tests to verify sanitizer functions work correctly:

```javascript
import { sanitizeText, sanitizeForLog, sanitizeUrlParam } from '../lib/sanitize.js';

describe('Sanitizer', () => {
  test('sanitizeText removes HTML tags', () => {
    expect(sanitizeText('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  test('sanitizeForLog removes newlines', () => {
    expect(sanitizeForLog('line1\nline2\rline3')).toBe('line1 line2 line3');
  });

  test('sanitizeUrlParam escapes HTML', () => {
    expect(sanitizeUrlParam('<img src=x>')).toBe('&lt;img src=x&gt;');
  });
});
```

## Known Limitations & Future Work

### Not Addressed in This PR

1. **CSP Headers**: Requires infrastructure changes (see issue #40)
2. **Subresource Integrity**: CDN resources should use SRI
3. **Content Security Policy Violations**: Monitoring requires reporting endpoint
4. **XSS Scanner in CI**: `retire.js` or OWASP ZAP integration (can be added)

### Recommendations for Future

1. Implement CSP nonce support (#40)
2. Add SRI headers for CDN resources
3. Integrate OWASP ZAP or similar in CI pipeline
4. Regular security audits (quarterly)
5. Dependency scanning (Dependabot, Snyk)

## Compliance & Standards

### CWE Coverage

- ✅ CWE-79: Improper Neutralization of Input During Web Page Generation (XSS)
- ✅ CWE-117: Improper Output Neutralization for Logs
- ✅ CWE-94: Improper Control of Generation of Code (eval)

### OWASP Top 10 (2021)

- ✅ A03:2021 – Injection
- ✅ A06:2021 – Vulnerable and Outdated Components

## References

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [Validator.js Documentation](https://github.com/validatorjs/validator.js)
- [CWE-79: Cross-site Scripting](https://cwe.mitre.org/data/definitions/79.html)
- [CWE-117: Improper Output Neutralization for Logs](https://cwe.mitre.org/data/definitions/117.html)

## Contributors

XSS Prevention & Input Sanitization Hardening (Issue #488)

---

**Status**: ✅ Complete and Ready for Review

**Breaking Changes**: None

**Dependencies Added**:

- `dompurify` (frontend)
- `validator` (backend)
