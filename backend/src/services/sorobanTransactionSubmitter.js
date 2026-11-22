import { log } from '../middleware/logger.js';

/**
 * Soroban Transaction Submitter Service with Nonce Queue Management
 * Manages transaction submission with proper nonce sequencing to prevent conflicts
 */

class NonceQueue {
  constructor() {
    this.nonces = new Map(); // Map<accountId, currentNonce>
    this.queue = []; // Queue of pending transactions
    this.processing = false;
  }

  async enqueue(tx) {
    this.queue.push(tx);
    if (!this.processing) {
      await this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const tx = this.queue.shift();
        await this.submitWithNonce(tx);
      }
    } finally {
      this.processing = false;
    }
  }

  async submitWithNonce(tx) {
    const { accountId, transaction, submitFn } = tx;

    try {
      const nonce = await this.getNextNonce(accountId);
      const result = await submitFn(transaction, nonce);

      log.info({ accountId, nonce, txHash: result?.hash }, 'soroban:tx:submitted');
      return result;
    } catch (error) {
      log.error({ accountId, error: error.message }, 'soroban:tx:submission:failed');
      throw error;
    }
  }

  async getNextNonce(accountId) {
    const current = this.nonces.get(accountId) ?? 0;
    const next = current + 1;
    this.nonces.set(accountId, next);
    return next;
  }

  resetNonce(accountId) {
    this.nonces.delete(accountId);
  }
}

class SorobanTransactionSubmitter {
  constructor({ rpcClient, db }) {
    this.rpcClient = rpcClient;
    this.db = db;
    this.nonceQueue = new NonceQueue();
  }

  async submitTransaction(accountId, transaction) {
    const submitFn = async (tx, nonce) => {
      const request = {
        jsonrpc: '2.0',
        id: `${accountId}-${nonce}`,
        method: 'sendTransaction',
        params: {
          transaction: tx,
          nonce,
        },
      };

      const response = await this.rpcClient.request(request);

      if (response.error) {
        const error = new Error(`Soroban submission failed: ${response.error.message}`);
        error.code = response.error.code;
        throw error;
      }

      return response.result;
    };

    return this.nonceQueue.enqueue({
      accountId,
      transaction,
      submitFn,
    });
  }

  async trackTransactionStatus(txHash) {
    try {
      const request = {
        jsonrpc: '2.0',
        id: `status-${txHash}`,
        method: 'getTransaction',
        params: { hash: txHash },
      };

      const response = await this.rpcClient.request(request);

      if (response.error) {
        log.warn({ txHash, error: response.error.message }, 'soroban:tx:status:error');
        return null;
      }

      return response.result;
    } catch (error) {
      log.error({ txHash, error: error.message }, 'soroban:tx:status:failed');
      throw error;
    }
  }

  getNonceQueue() {
    return this.nonceQueue;
  }
}

export { SorobanTransactionSubmitter, NonceQueue };
