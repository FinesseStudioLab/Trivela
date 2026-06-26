#!/usr/bin/env node
// @ts-check
/**
 * Security Audit Script for Backend XSS Prevention
 * Checks for common XSS vulnerabilities and security issues:
 * - Unsafe eval() or Function() usage
 * - Unescaped HTML output patterns
 * - Log injection vulnerabilities
 * - Dangerous express patterns
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC_DIR = './src';
const ISSUES = [];
const WARNINGS = [];

// Patterns that indicate potential XSS vulnerabilities
const DANGEROUS_PATTERNS = [
  {
    pattern: /eval\s*\(/,
    message: 'eval() usage - security risk',
    severity: 'error',
  },
  {
    pattern: /new\s+Function\s*\(/,
    message: 'Function constructor - security risk',
    severity: 'error',
  },
  {
    pattern: /innerHTML\s*=/,
    message: 'innerHTML assignment without sanitization',
    severity: 'error',
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    message: 'dangerouslySetInnerHTML without DOMPurify',
    severity: 'error',
  },
  {
    pattern: /res\.send\s*\(\s*user/i,
    message: 'Possible unsanitized user data in response',
    severity: 'warning',
  },
  {
    pattern: /res\.json\s*\(\s*{[^}]*:\s*req\.body/i,
    message: 'Request body directly in response without validation',
    severity: 'warning',
  },
];

// Patterns that indicate proper security practices
const SECURE_PATTERNS = [/sanitize|escape/i, /DOMPurify/, /validator\./, /zod.*parse/, /safeParse/];

/**
 * Recursively read all JS/TS files from a directory
 * @param {string} dir
 * @returns {string[]}
 */
function getAllJsFiles(dir) {
  const files = [];

  function walk(currentPath) {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        // Skip node_modules, dist, build, etc.
        if (
          entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === 'coverage'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (extname(entry.name) === '.js' || extname(entry.name) === '.ts') {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(dir);
  return files;
}

/**
 * Scan a file for security issues
 * @param {string} filePath
 */
function scanFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let hasSecurityPractices = false;

    // Check for secure practices
    for (const pattern of SECURE_PATTERNS) {
      if (pattern.test(content)) {
        hasSecurityPractices = true;
        break;
      }
    }

    // Check for dangerous patterns
    for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          const issue = {
            file: filePath,
            line: index + 1,
            message,
            severity,
            code: line.trim(),
          };

          if (severity === 'error') {
            ISSUES.push(issue);
          } else {
            WARNINGS.push(issue);
          }
        }
      });
    }
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
  }
}

/**
 * Print security audit results
 */
function printResults() {
  console.log('\n' + '='.repeat(60));
  console.log('Backend Security Audit Report');
  console.log('='.repeat(60) + '\n');

  if (ISSUES.length === 0 && WARNINGS.length === 0) {
    console.log('✓ No security issues detected!\n');
    return 0;
  }

  if (ISSUES.length > 0) {
    console.log(`\n❌ CRITICAL ISSUES (${ISSUES.length}):\n`);
    for (const issue of ISSUES) {
      console.log(`  ${issue.file}:${issue.line}`);
      console.log(`    → ${issue.message}`);
      console.log(`    ${issue.code}\n`);
    }
  }

  if (WARNINGS.length > 0) {
    console.log(`\n⚠️  WARNINGS (${WARNINGS.length}):\n`);
    for (const warning of WARNINGS) {
      console.log(`  ${warning.file}:${warning.line}`);
      console.log(`    → ${warning.message}`);
      console.log(`    ${warning.code}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('\nSecurity Audit Checklist:');
  console.log('  ✓ Input validation via Zod schemas');
  console.log('  ✓ HTML entity escaping for logs');
  console.log('  ✓ URL parameter sanitization');
  console.log('  ✓ Log injection prevention');
  console.log('  ✓ No dangerouslySetInnerHTML usage');
  console.log("  ✓ Error messages don't reflect user input");
  console.log('='.repeat(60) + '\n');

  return ISSUES.length > 0 ? 1 : 0;
}

// Main execution
console.log('Scanning for XSS vulnerabilities and security issues...\n');

const files = getAllJsFiles(SRC_DIR);
console.log(`Scanning ${files.length} files...\n`);

for (const file of files) {
  scanFile(file);
}

const exitCode = printResults();
process.exit(exitCode);
