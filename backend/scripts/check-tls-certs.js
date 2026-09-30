#!/usr/bin/env node
// Usage: node scripts/check-tls-certs.js [--warn-days=30] host[:port] ...
// Endpoints may also come from TLS_CHECK_ENDPOINTS (comma separated).
// Exits 1 if any certificate expires within the warning window, is expired, or cannot be checked.
import { checkEndpoints, DEFAULT_WARN_DAYS } from '../src/security/tlsCertCheck.js';

const args = process.argv.slice(2);
let warnDays = Number(process.env.TLS_WARN_DAYS ?? DEFAULT_WARN_DAYS);
const endpoints = (process.env.TLS_CHECK_ENDPOINTS || '').split(',').map((s) => s.trim()).filter(Boolean);
for (const arg of args) {
  if (arg.startsWith('--warn-days=')) warnDays = Number(arg.split('=')[1]);
  else endpoints.push(arg);
}

if (!Number.isFinite(warnDays) || warnDays < 0 || endpoints.length === 0) {
  console.error('Usage: check-tls-certs.js [--warn-days=30] host[:port] ... (or set TLS_CHECK_ENDPOINTS)');
  process.exit(2);
}

const results = await checkEndpoints(endpoints, { warnDays });
let failed = false;
for (const r of results) {
  if (r.status === 'ok') {
    console.log(`OK      ${r.endpoint}: ${r.daysRemaining} days remaining`);
  } else if (r.status === 'error') {
    failed = true;
    console.error(`::error::TLS check failed for ${r.endpoint}: ${r.error}`);
  } else {
    failed = true;
    console.error(`::error::TLS certificate for ${r.endpoint} ${r.status === 'expired' ? 'has expired' : `expires in ${r.daysRemaining} days`} (threshold ${warnDays})`);
  }
}
process.exit(failed ? 1 : 0);
