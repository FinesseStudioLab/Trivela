import tls from 'node:tls';

export const DEFAULT_WARN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a host spec ("example.com", "example.com:8443" or an https URL)
 * into { host, port }. Throws on invalid input.
 */
export function parseEndpoint(spec) {
  if (typeof spec !== 'string' || !spec.trim()) {
    throw new TypeError('Endpoint must be a non-empty string');
  }
  const raw = spec.trim();
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (!url.hostname) throw new TypeError(`Invalid endpoint: ${spec}`);
  return { host: url.hostname, port: url.port ? Number(url.port) : 443 };
}

/** Whole days between `now` and `validTo` (negative when expired). */
export function daysUntil(validTo, now = new Date()) {
  const end = new Date(validTo).getTime();
  if (Number.isNaN(end)) throw new TypeError(`Invalid certificate date: ${validTo}`);
  return Math.floor((end - now.getTime()) / DAY_MS);
}

/** Classify remaining days as ok | warning | expired. */
export function classify(daysRemaining, warnDays = DEFAULT_WARN_DAYS) {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= warnDays) return 'warning';
  return 'ok';
}

/** Fetch the peer certificate's expiry from a live TLS endpoint. */
export function fetchCertExpiry({ host, port = 443 }, { timeoutMs = 10000, connect = tls.connect } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, servername: host, rejectUnauthorized: false });
    const fail = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error(`Timed out connecting to ${host}:${port}`)));
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) {
        reject(new Error(`No certificate returned by ${host}:${port}`));
        return;
      }
      resolve({ validTo: cert.valid_to, subject: cert.subject?.CN, issuer: cert.issuer?.CN });
    });
  });
}

/**
 * Check a list of endpoints. Never throws for a single endpoint failure;
 * failures are reported with status "error".
 */
export async function checkEndpoints(specs, { warnDays = DEFAULT_WARN_DAYS, now = new Date(), fetchExpiry = fetchCertExpiry } = {}) {
  return Promise.all(
    specs.map(async (spec) => {
      try {
        const endpoint = parseEndpoint(spec);
        const info = await fetchExpiry(endpoint);
        const daysRemaining = daysUntil(info.validTo, now);
        return {
          endpoint: spec,
          ...info,
          daysRemaining,
          status: classify(daysRemaining, warnDays),
        };
      } catch (err) {
        return { endpoint: spec, status: 'error', error: err.message };
      }
    }),
  );
}
