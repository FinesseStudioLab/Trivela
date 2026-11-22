import {
  Keypair,
  StrKey,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

/**
 * A tiny in-memory Soroban RPC for the rewards contract, driven through Playwright's request
 * routing. It answers the JSON-RPC calls the generated contract client makes (account lookup,
 * simulation, submission, polling) with real XDR, and keeps the chain state in plain objects:
 * `balance(user)` reads it, `claim(user, amount)` debits it and credits the claimed total.
 *
 * Only what the app calls is implemented; anything else returns a JSON-RPC "method not found".
 */

const INT64 = (n) => xdr.Int64.fromString(String(n));
const u64 = (n) => nativeToScVal(BigInt(n), { type: 'u64' });

// Error::InsufficientBalance as mapped by src/lib/contractErrors.js.
export const CONTRACT_ERROR_INSUFFICIENT_BALANCE = 2;

export function createSorobanChainMock({
  networkPassphrase = Networks.TESTNET,
  balances = {},
  startLedger = 1_000,
} = {}) {
  const state = {
    balances: { ...balances },
    claimed: 0n,
    ledger: startLedger,
    submitted: new Map(), // tx hash -> { method, returnValue, envelopeXdr }
    calls: [],
    sequences: new Map(),
  };
  state.balances = Object.fromEntries(
    Object.entries(state.balances).map(([k, v]) => [k, BigInt(v)]),
  );

  const accountLedgerEntry = (address) =>
    xdr.LedgerEntryData.account(
      new xdr.AccountEntry({
        accountId: Keypair.fromPublicKey(address).xdrAccountId(),
        balance: INT64('1000000000'),
        seqNum: xdr.SequenceNumber.fromString(String(state.sequences.get(address) ?? 100)),
        numSubEntries: 0,
        inflationDest: null,
        flags: 0,
        homeDomain: '',
        thresholds: Buffer.from([1, 0, 0, 0]),
        signers: [],
        ext: new xdr.AccountEntryExt(0),
      }),
    );

  const decodeInvocation = (txXdr) => {
    const tx = TransactionBuilder.fromXDR(txXdr, networkPassphrase);
    const invoke = tx.operations[0].func.invokeContract();
    const method = invoke.functionName().toString();
    const args = invoke.args().map((arg) => scValToNative(arg));
    return { tx, method, args };
  };

  const sorobanData = (readWriteKeys = []) =>
    new xdr.SorobanTransactionData({
      ext: new xdr.SorobanTransactionDataExt(0),
      resources: new xdr.SorobanResources({
        footprint: new xdr.LedgerFootprint({ readOnly: [], readWrite: readWriteKeys }),
        instructions: 1_000,
        diskReadBytes: 0,
        writeBytes: 0,
      }),
      resourceFee: INT64('100'),
    });

  const evaluate = ({ method, args }) => {
    const [user, amount] = args;
    if (method === 'balance') {
      return { returnValue: u64(state.balances[user] ?? 0n), writes: [] };
    }
    if (method === 'claim') {
      const current = state.balances[user] ?? 0n;
      const value = BigInt(amount);
      if (value > current) {
        return { error: `HostError: Error(Contract, #${CONTRACT_ERROR_INSUFFICIENT_BALANCE})` };
      }
      return {
        returnValue: u64(current - value),
        writes: [
          xdr.LedgerKey.account(
            new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(user).xdrAccountId() }),
          ),
        ],
        apply: () => {
          state.balances[user] = current - value;
          state.claimed += value;
        },
      };
    }
    return { error: `HostError: unknown function ${method}` };
  };

  const handlers = {
    getHealth: () => ({
      status: 'healthy',
      latestLedger: state.ledger,
      oldestLedger: 1,
      ledgerRetentionWindow: 17280,
    }),
    getNetwork: () => ({ passphrase: networkPassphrase, protocolVersion: 23 }),
    getLatestLedger: () => ({ id: 'mock', protocolVersion: 23, sequence: state.ledger }),
    getLedgerEntries: (params) => {
      const entries = (params.keys ?? []).map((key) => {
        const ledgerKey = xdr.LedgerKey.fromXDR(key, 'base64');
        const address = StrKey.encodeEd25519PublicKey(ledgerKey.account().accountId().ed25519());
        return {
          key,
          xdr: accountLedgerEntry(address).toXDR('base64'),
          lastModifiedLedgerSeq: state.ledger,
        };
      });
      return { entries, latestLedger: state.ledger };
    },
    simulateTransaction: (params) => {
      const invocation = decodeInvocation(params.transaction);
      const result = evaluate(invocation);
      if (result.error) return { error: result.error, latestLedger: state.ledger };
      return {
        latestLedger: state.ledger,
        minResourceFee: '100',
        transactionData: sorobanData(result.writes).toXDR('base64'),
        results: [{ auth: [], xdr: result.returnValue.toXDR('base64') }],
        events: [],
      };
    },
    sendTransaction: (params) => {
      const invocation = decodeInvocation(params.transaction);
      const result = evaluate(invocation);
      const hash = invocation.tx.hash().toString('hex');
      if (result.error) {
        return { status: 'ERROR', hash, latestLedger: state.ledger, latestLedgerCloseTime: '0' };
      }
      result.apply?.();
      state.ledger += 1;
      state.submitted.set(hash, {
        returnValue: result.returnValue,
        envelopeXdr: params.transaction,
      });
      return {
        status: 'PENDING',
        hash,
        latestLedger: state.ledger,
        latestLedgerCloseTime: String(Math.floor(Date.now() / 1000)),
      };
    },
    getTransaction: (params) => {
      const record = state.submitted.get(params.hash);
      if (!record)
        return {
          status: 'NOT_FOUND',
          latestLedger: state.ledger,
          latestLedgerCloseTime: '0',
          oldestLedger: 1,
          oldestLedgerCloseTime: '0',
        };
      const meta = new xdr.TransactionMeta(
        3,
        new xdr.TransactionMetaV3({
          ext: new xdr.ExtensionPoint(0),
          txChangesBefore: [],
          operations: [],
          txChangesAfter: [],
          sorobanMeta: new xdr.SorobanTransactionMeta({
            ext: new xdr.SorobanTransactionMetaExt(0),
            events: [],
            returnValue: record.returnValue,
            diagnosticEvents: [],
          }),
        }),
      );
      const result = new xdr.TransactionResult({
        feeCharged: INT64('100'),
        result: xdr.TransactionResultResult.txSuccess([]),
        ext: new xdr.TransactionResultExt(0),
      });
      const nowSec = String(Math.floor(Date.now() / 1000));
      return {
        status: 'SUCCESS',
        latestLedger: state.ledger,
        latestLedgerCloseTime: nowSec,
        oldestLedger: 1,
        oldestLedgerCloseTime: '0',
        ledger: state.ledger,
        createdAt: nowSec,
        applicationOrder: 1,
        feeBump: false,
        envelopeXdr: record.envelopeXdr,
        resultXdr: result.toXDR('base64'),
        resultMetaXdr: meta.toXDR('base64'),
      };
    },
  };

  return {
    state,
    /** Playwright `route.fulfill` handler for POST requests to the Soroban RPC URL. */
    async handle(route) {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        });
        return;
      }
      const request = JSON.parse(route.request().postData() ?? '{}');
      state.calls.push(request.method);
      const handler = handlers[request.method];
      let body;
      if (!handler) {
        body = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
      } else {
        try {
          const result = handler(request.params ?? {});
          body =
            result?.error && request.method !== 'simulateTransaction'
              ? { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: result.error } }
              : { jsonrpc: '2.0', id: request.id, result };
        } catch (error) {
          body = {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32603, message: String(error?.message ?? error) },
          };
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      });
    },
  };
}
