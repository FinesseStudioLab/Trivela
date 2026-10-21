import { Account, BASE_FEE, Contract, TransactionBuilder, rpc } from '@stellar/stellar-sdk';

const DEFAULT_TIMEOUT_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_ATTEMPTS = 30;

/** Thrown when any stage of the build → simulate → assemble → sign → submit lifecycle fails. */
export class SorobanTransactionError extends Error {
  /**
   * @param {string} message
   * @param {{ stage: string, retryable?: boolean, cause?: unknown, hash?: string }} details
   */
  constructor(message, { stage, retryable = false, cause, hash }) {
    super(message);
    this.name = 'SorobanTransactionError';
    this.stage = stage;
    this.retryable = retryable;
    this.hash = hash;
    if (cause) this.cause = cause;
  }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shared Soroban transaction construction (#460): one place for the
 * simulate → assemble → sign → submit lifecycle and its retry rules, so
 * backend routes and admin scripts stop re-implementing it.
 *
 * @param {{
 *   server: {
 *     getAccount(id: string): Promise<any>,
 *     simulateTransaction(tx: any): Promise<any>,
 *     sendTransaction(tx: any): Promise<any>,
 *     getTransaction(hash: string): Promise<any>,
 *   },
 *   networkPassphrase: string,
 *   maxAttempts?: number,
 *   retryDelayMs?: number,
 *   pollIntervalMs?: number,
 *   pollAttempts?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   assemble?: (tx: any, simulation: any) => { build(): any },
 * }} options
 */
export function createSorobanTransactionBuilder({
  server,
  networkPassphrase,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollAttempts = DEFAULT_POLL_ATTEMPTS,
  sleep = sleepFor,
  assemble = (tx, simulation) => rpc.assembleTransaction(tx, simulation),
}) {
  if (!server) throw new TypeError('server is required');
  if (!networkPassphrase) throw new TypeError('networkPassphrase is required');

  /**
   * Builds an unsigned contract-call transaction for `sourcePublicKey`.
   * @param {{
   *   sourcePublicKey: string,
   *   contractId: string,
   *   method: string,
   *   args?: any[],
   *   fee?: string,
   *   timeoutSeconds?: number,
   * }} params
   */
  async function build({
    sourcePublicKey,
    contractId,
    method,
    args = [],
    fee = BASE_FEE,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  }) {
    if (!sourcePublicKey || !contractId || !method) {
      throw new SorobanTransactionError('sourcePublicKey, contractId and method are required', {
        stage: 'build',
      });
    }

    let account;
    try {
      const loaded = await server.getAccount(sourcePublicKey);
      account = new Account(
        sourcePublicKey,
        loaded.sequenceNumber ? loaded.sequenceNumber() : loaded.sequence,
      );
    } catch (cause) {
      throw new SorobanTransactionError(
        `Could not load source account: ${cause?.message ?? cause}`,
        {
          stage: 'build',
          retryable: true,
          cause,
        },
      );
    }

    try {
      return new TransactionBuilder(account, { fee, networkPassphrase })
        .addOperation(new Contract(contractId).call(method, ...args))
        .setTimeout(timeoutSeconds)
        .build();
    } catch (cause) {
      throw new SorobanTransactionError(`Could not build transaction: ${cause?.message ?? cause}`, {
        stage: 'build',
        cause,
      });
    }
  }

  /** Simulates `tx` and returns the simulation, throwing on a simulation error. */
  async function simulate(tx) {
    let simulation;
    try {
      simulation = await server.simulateTransaction(tx);
    } catch (cause) {
      throw new SorobanTransactionError(`Simulation request failed: ${cause?.message ?? cause}`, {
        stage: 'simulate',
        retryable: true,
        cause,
      });
    }
    if (simulation?.error) {
      throw new SorobanTransactionError(`Simulation failed: ${simulation.error}`, {
        stage: 'simulate',
        retryable: false,
      });
    }
    return simulation;
  }

  /** Applies the simulation's footprint/resource fee to `tx`. */
  function assembleTx(tx, simulation) {
    try {
      return assemble(tx, simulation).build();
    } catch (cause) {
      throw new SorobanTransactionError(
        `Could not assemble transaction: ${cause?.message ?? cause}`,
        {
          stage: 'assemble',
          cause,
        },
      );
    }
  }

  /** Signs `tx` with a Keypair-like signer (`sign(tx)`), or an async `(tx) => tx` function. */
  async function sign(tx, signer) {
    try {
      if (typeof signer === 'function') {
        return (await signer(tx)) ?? tx;
      }
      tx.sign(signer);
      return tx;
    } catch (cause) {
      throw new SorobanTransactionError(`Could not sign transaction: ${cause?.message ?? cause}`, {
        stage: 'sign',
        cause,
      });
    }
  }

  /** Submits `tx` and polls until it leaves NOT_FOUND. Returns the final transaction result. */
  async function submit(tx) {
    let sent;
    try {
      sent = await server.sendTransaction(tx);
    } catch (cause) {
      throw new SorobanTransactionError(`Submission failed: ${cause?.message ?? cause}`, {
        stage: 'submit',
        retryable: true,
        cause,
      });
    }

    if (sent.status === 'ERROR') {
      throw new SorobanTransactionError('Transaction rejected by the network', {
        stage: 'submit',
        hash: sent.hash,
      });
    }
    if (sent.status === 'TRY_AGAIN_LATER') {
      throw new SorobanTransactionError('Network asked to try again later', {
        stage: 'submit',
        retryable: true,
        hash: sent.hash,
      });
    }

    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const result = await server.getTransaction(sent.hash);
      if (result.status === 'SUCCESS') {
        return { hash: sent.hash, ...result };
      }
      if (result.status === 'FAILED') {
        throw new SorobanTransactionError('Transaction failed on-chain', {
          stage: 'submit',
          hash: sent.hash,
        });
      }
      await sleep(pollIntervalMs);
    }

    throw new SorobanTransactionError('Timed out waiting for transaction confirmation', {
      stage: 'submit',
      retryable: false,
      hash: sent.hash,
    });
  }

  /**
   * Full lifecycle for one contract call. Retryable failures (RPC hiccups,
   * TRY_AGAIN_LATER) rebuild the transaction from a fresh sequence number up
   * to `maxAttempts` times with linear backoff; non-retryable ones fail fast.
   * @param {Parameters<typeof build>[0] & { signer: any }} params
   */
  async function invoke({ signer, ...params }) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const built = await build(params);
        const simulation = await simulate(built);
        const assembled = assembleTx(built, simulation);
        const signed = await sign(assembled, signer);
        const result = await submit(signed);
        return { ...result, attempts: attempt, simulation };
      } catch (error) {
        lastError = error;
        const retryable = error instanceof SorobanTransactionError && error.retryable;
        if (!retryable || attempt === maxAttempts) break;
        await sleep(retryDelayMs * attempt);
      }
    }
    throw lastError;
  }

  return { build, simulate, assemble: assembleTx, sign, submit, invoke };
}
