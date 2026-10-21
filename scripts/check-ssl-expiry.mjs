#!/usr/bin/env node
/**
 * TLS certificate expiry monitor (issue #1362).
 *
 * Connects to each configured domain endpoint and fails when the peer
 * certificate expires within the alert window (default 30 days), so
 * maintainers are warned before encrypted transport breaks.
 *
 * Environment variables:
 *   SSL_CHECK_DOMAINS   Comma-separated host[:port] list (default: localhost:443 disabled)
 *   SSL_EXPIRY_WARN_DAYS  Days before expiry to alert (default: 30)
 *   SSL_CHECK_SUMMARY   If set, write a markdown report to this file
 *
 * Usage:
 *   node scripts/check-ssl-expiry.mjs
 *   SSL_CHECK_DOMAINS=example.com,api.example.com:443 node scripts/check-ssl-expiry.mjs
 */

import tls from 'node:tls';
import { writeFileSync } from 'node:fs';

const DOMAINS = (process.env.SSL_CHECK_DOMAINS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const WARN_DAYS = Number(process.env.SSL_EXPIRY_WARN_DAYS ?? 30);
const SUMMARY_FILE = process.env.SSL_CHECK_SUMMARY ?? '';
const WARN_MS = WARN_DAYS * 24 * 60 * 60 * 1000;

/**
 * @param {string} host
 * @param {number} port
 * @returns {Promise<{ subject: string, issuer: string, validTo: Date, daysRemaining: number }>}
 */
function inspectCertificate(host, port = 443) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: 15_000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          reject(new Error(`No peer certificate presented by ${host}:${port}`));
          return;
        }
        const validTo = new Date(cert.valid_to);
        resolve({
          subject: cert.subject?.CN ?? host,
          issuer: cert.issuer?.O ?? cert.issuer?.CN ?? 'unknown',
          validTo,
          daysRemaining: Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        });
      },
    );

    socket.on('error', (err) => reject(err));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Connection to ${host}:${port} timed out`));
    });
  });
}

async function main() {
  if (DOMAINS.length === 0) {
    process.stderr.write(
      '[ssl-check] SSL_CHECK_DOMAINS is empty — nothing to check. Set it to a comma-separated host[:port] list.\n',
    );
    process.exit(0);
  }

  const rows = [];
  let expiring = 0;

  for (const entry of DOMAINS) {
    const [host, portRaw] = entry.split(':');
    const port = Number(portRaw ?? 443);
    try {
      const info = await inspectCertificate(host, port);
      const ok = info.daysRemaining > WARN_DAYS;
      if (!ok) expiring += 1;
      rows.push({ endpoint: `${host}:${port}`, status: ok ? 'ok' : 'expiring', ...info });
    } catch (err) {
      expiring += 1;
      rows.push({
        endpoint: `${host}:${port}`,
        status: 'error',
        subject: '-',
        issuer: '-',
        validTo: new Date(0),
        daysRemaining: -1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const lines = [
    '# TLS Certificate Expiry Report',
    '',
    `Alert threshold: **${WARN_DAYS} days**`,
    '',
    '| Endpoint | Status | Subject | Issuer | Expires | Days left |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    const expires = row.status === 'error' ? '-' : row.validTo.toISOString().slice(0, 10);
    const days = row.status === 'error' ? '-' : String(row.daysRemaining);
    const detail = row.error ? ` — ${row.error}` : '';
    lines.push(
      `| ${row.endpoint} | ${row.status}${detail} | ${row.subject} | ${row.issuer} | ${expires} | ${days} |`,
    );
  }

  lines.push('');
  if (expiring > 0) {
    lines.push(`**${expiring} endpoint(s) need attention** (expiring within ${WARN_DAYS} days or unreachable).`);
  } else {
    lines.push(`All ${rows.length} endpoint(s) are valid for more than ${WARN_DAYS} days.`);
  }

  const report = lines.join('\n');
  if (SUMMARY_FILE) {
    writeFileSync(SUMMARY_FILE, report + '\n', 'utf8');
  }
  process.stdout.write(report + '\n');

  if (expiring > 0) {
    process.stderr.write(`[ssl-check] FAIL — ${expiring} endpoint(s) expiring within ${WARN_DAYS} days\n`);
    process.exit(1);
  }
  process.stderr.write(`[ssl-check] OK — all ${rows.length} endpoint(s) healthy\n`);
}

main();
