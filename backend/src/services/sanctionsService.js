/**
 * Sanctions / blocklist screening for payout addresses — closes #955.
 *
 * Provider is selected via SANCTIONS_PROVIDER env var:
 *   "local"  (default) — comma-separated blocklist in SANCTIONS_BLOCKLIST env var
 *   "env"    — alias for "local"
 *
 * Additional providers (OFAC SDN API, etc.) can be plugged in by extending
 * createProvider() below without touching the public API.
 */

/** @typedef {{ blocked: boolean; reason?: string; provider: string }} ScreenResult */

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** @param {string} value */
function isStellarAddress(value) {
  return STELLAR_ADDRESS_RE.test(value.trim());
}

/**
 * Parse a comma-separated list of blocked addresses from an env string.
 * @param {string | undefined} raw
 * @returns {Set<string>}
 */
function parseBlocklist(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * @param {Set<string>} blocklist
 * @returns {{ screen: (address: string) => Promise<ScreenResult> }}
 */
function createLocalProvider(blocklist) {
  return {
    async screen(address) {
      const normalized = address.trim().toUpperCase();
      if (blocklist.has(normalized)) {
        return { blocked: true, reason: 'address on local blocklist', provider: 'local' };
      }
      return { blocked: false, provider: 'local' };
    },
  };
}

/**
 * Build a sanctions provider from environment / options.
 * @param {{ provider?: string; blocklist?: string }} opts
 */
function createProvider(opts) {
  const providerName = (opts.provider ?? process.env.SANCTIONS_PROVIDER ?? 'local').toLowerCase();
  const blocklistRaw = opts.blocklist ?? process.env.SANCTIONS_BLOCKLIST;

  if (providerName === 'local' || providerName === 'env') {
    return createLocalProvider(parseBlocklist(blocklistRaw));
  }

  throw new Error(
    `Unknown SANCTIONS_PROVIDER "${providerName}". Supported: "local". ` +
      'Set SANCTIONS_PROVIDER=local or leave unset.',
  );
}

/**
 * @param {{ provider?: string; blocklist?: string; logger?: { warn: Function } }} [opts]
 */
export function createSanctionsService(opts = {}) {
  const provider = createProvider(opts);

  return {
    /**
     * Screen a Stellar address before payout/settlement.
     * @param {string} address
     * @param {{ logger?: { warn: Function } }} [context]
     * @returns {Promise<ScreenResult>}
     */
    async screen(address, context = {}) {
      if (!isStellarAddress(address)) {
        return { blocked: false, provider: 'local', reason: 'not a Stellar address — skipped' };
      }

      const result = await provider.screen(address);

      if (result.blocked) {
        const logger = context.logger ?? opts.logger;
        if (logger) {
          logger.warn(
            {
              address: address.slice(0, 8) + '…',
              reason: result.reason,
              provider: result.provider,
            },
            'sanctions: payout address blocked',
          );
        }
      }

      return result;
    },
  };
}
