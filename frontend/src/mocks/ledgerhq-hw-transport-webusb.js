/**
 * Test-only stand-in for `@ledgerhq/hw-transport-webusb`.
 *
 * The Ledger libraries are optional at runtime — LedgerProvider imports them
 * dynamically and degrades gracefully when they are absent — so they are not
 * install-time dependencies. Vitest aliases the specifier here (see
 * vitest.config.js) purely so the module resolves; `vi.mock()` in the test
 * replaces the behaviour.
 */
export default {
  create: async () => {
    throw new Error('LedgerHQ WebUSB transport stub — mock this module in tests');
  },
};
