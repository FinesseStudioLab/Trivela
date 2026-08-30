/**
 * Event Indexer Service
 * 
 * Durable on-chain event indexer for credit/claim/redeem/referral events.
 * Ingests contract events into queryable Postgres store with cursor-based pagination,
 * backfill support, and idempotent upserts.
 * 
 * Fixes: https://github.com/FinesseStudioLab/Trivela/issues/856
 */

import pg from 'pg';
import { SorobanRpc, Contract } from '@stellar/stellar-sdk';
import pino from 'pino';

const logger = pino({ name: 'event-indexer' });
const { Pool } = pg;

export class EventIndexer {
  constructor({ rpcUrl, databaseUrl, contractId, pollIntervalMs = 5000 }) {
    this.rpcUrl = rpcUrl;
    this.contractId = contractId;
    this.pollIntervalMs = pollIntervalMs;
    this.server = new SorobanRpc.Server(rpcUrl);
    this.pool = new Pool({ connectionString: databaseUrl });
    this.running = false;
    this.cursor = null;
  }

  /**
   * Initialize database schema
   */
  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS indexer_events (
          id SERIAL PRIMARY KEY,
          ledger BIGINT NOT NULL,
          tx_hash TEXT NOT NULL,
          op_index INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          event_data JSONB NOT NULL,
          contract_id TEXT NOT NULL,
          indexed_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(ledger, tx_hash, op_index)
        );
        CREATE INDEX IF NOT EXISTS idx_events_ledger ON indexer_events(ledger DESC);
        CREATE INDEX IF NOT EXISTS idx_events_type ON indexer_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_events_contract ON indexer_events(contract_id);
        
        CREATE TABLE IF NOT EXISTS indexer_cursor (
          id INTEGER PRIMARY KEY DEFAULT 1,
          cursor TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW(),
          CHECK (id = 1)
        );
      `);
      
      // Load persisted cursor
      const cursorResult = await client.query('SELECT cursor FROM indexer_cursor WHERE id = 1');
      if (cursorResult.rows.length > 0) {
        this.cursor = cursorResult.rows[0].cursor;
        logger.info({ cursor: this.cursor }, 'Loaded cursor from database');
      }
      
      logger.info('Indexer database initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Start polling for events
   */
  async start() {
    if (this.running) {
      logger.warn('Indexer already running');
      return;
    }
    
    await this.initialize();
    this.running = true;
    logger.info({ contractId: this.contractId, pollIntervalMs: this.pollIntervalMs }, 'Starting event indexer');
    
    this._poll();
  }

  /**
   * Stop polling
   */
  async stop() {
    this.running = false;
    await this.pool.end();
    logger.info('Event indexer stopped');
  }

  /**
   * Poll loop
   */
  async _poll() {
    while (this.running) {
      try {
        await this.ingest();
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      } catch (error) {
        logger.error({ error: error.message }, 'Error during event ingestion');
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  /**
   * Ingest events from RPC
   */
  async ingest() {
    const request = {
      filters: [{
        type: 'contract',
        contractIds: [this.contractId]
      }],
      pagination: {
        limit: 100
      }
    };
    
    if (this.cursor) {
      request.startLedger = this.cursor;
    }
    
    const response = await this.server.getEvents(request);
    
    if (!response.events || response.events.length === 0) {
      logger.debug('No new events');
      return;
    }
    
    logger.info({ eventCount: response.events.length }, 'Fetched events');
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const event of response.events) {
        await this._indexEvent(client, event);
      }
      
      // Update cursor
      if (response.latestLedger) {
        this.cursor = response.latestLedger.toString();
        await client.query(
          `INSERT INTO indexer_cursor (id, cursor, updated_at) 
           VALUES (1, $1, NOW()) 
           ON CONFLICT (id) DO UPDATE SET cursor = $1, updated_at = NOW()`,
          [this.cursor]
        );
      }
      
      await client.query('COMMIT');
      logger.info({ cursor: this.cursor }, 'Cursor updated');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Index a single event with idempotent upsert
   */
  async _indexEvent(client, event) {
    const { ledger, txHash, contractId } = event;
    const eventType = event.topic?.[0]?.value?.toString() || 'unknown';
    const eventData = this._parseEventData(event);
    
    await client.query(
      `INSERT INTO indexer_events (ledger, tx_hash, op_index, event_type, event_data, contract_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ledger, tx_hash, op_index) DO NOTHING`,
      [ledger, txHash, event.pagingToken || 0, eventType, JSON.stringify(eventData), contractId]
    );
  }

  /**
   * Parse event data from Soroban event structure.
   *
   * For decay-specific events we extract typed fields so queries can filter
   * on `event_data->>'campaign_id'` or `event_data->>'amount_decayed'`
   * without having to decode raw Soroban XDR in SQL.
   *
   * Recognised event types and their extracted shapes:
   *
   *   decay     topics: [decay, user]       data: (campaign_id, amount_decayed)
   *   decay_set topics: [decay_set, cid]    data: (kind, rate_bps, cliff_ledgers)
   */
  _parseEventData(event) {
    try {
      const topics = event.topic?.map(t => t.value?.toString()) || [];
      const eventType = topics[0] || 'unknown';
      const value = event.value?.value || {};

      // ── Decay event: lazily applied point removal ──────────────────────────
      if (eventType === 'decay') {
        // topics[1] is the affected user address
        const user = topics[1] ?? null;
        // value is a tuple (campaign_id: u64, amount_decayed: u64)
        const [campaign_id, amount_decayed] = Array.isArray(value)
          ? value
          : [value?.campaign_id ?? null, value?.amount_decayed ?? null];

        return {
          topics,
          user,
          campaign_id: campaign_id !== null ? String(campaign_id) : null,
          amount_decayed: amount_decayed !== null ? String(amount_decayed) : null,
          rawEvent: event,
        };
      }

      // ── Decay policy set / replaced ────────────────────────────────────────
      if (eventType === 'decay_set') {
        // topics[1] is the campaign_id
        const campaign_id = topics[1] ?? null;
        // value is a tuple (kind: u32, rate_bps: u32, cliff_ledgers: u32)
        const [kind, rate_bps, cliff_ledgers] = Array.isArray(value)
          ? value
          : [value?.kind ?? null, value?.rate_bps ?? null, value?.cliff_ledgers ?? null];

        return {
          topics,
          campaign_id: campaign_id !== null ? String(campaign_id) : null,
          kind: kind !== null ? String(kind) : null,
          rate_bps: rate_bps !== null ? String(rate_bps) : null,
          cliff_ledgers: cliff_ledgers !== null ? String(cliff_ledgers) : null,
          rawEvent: event,
        };
      }

      // ── Default: generic extraction for all other event types ──────────────
      return {
        topics,
        value,
        rawEvent: event,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to parse event data');
      return { raw: event };
    }
  }

  /**
   * Backfill events from a specific ledger range
   */
  async backfill(startLedger, endLedger) {
    logger.info({ startLedger, endLedger }, 'Starting backfill');
    
    const originalCursor = this.cursor;
    this.cursor = startLedger.toString();
    
    try {
      while (parseInt(this.cursor) < endLedger) {
        await this.ingest();
        
        if (parseInt(this.cursor) === startLedger) {
          // No progress made, break to avoid infinite loop
          break;
        }
      }
      
      logger.info({ startLedger, endLedger }, 'Backfill complete');
    } finally {
      this.cursor = originalCursor;
    }
  }

  /**
   * Query events by type
   */
  async getEventsByType(eventType, limit = 100, offset = 0) {
    const result = await this.pool.query(
      `SELECT * FROM indexer_events 
       WHERE event_type = $1 
       ORDER BY ledger DESC 
       LIMIT $2 OFFSET $3`,
      [eventType, limit, offset]
    );
    return result.rows;
  }

  /**
   * Query events by ledger range
   */
  async getEventsByLedgerRange(startLedger, endLedger, limit = 100) {
    const result = await this.pool.query(
      `SELECT * FROM indexer_events 
       WHERE ledger >= $1 AND ledger <= $2 
       ORDER BY ledger DESC 
       LIMIT $3`,
      [startLedger, endLedger, limit]
    );
    return result.rows;
  }

  /**
   * Derive balance for an account from indexed events.
   *
   * Accounts for decay events: when points are lazily removed from a balance
   * by the contract's decay mechanism a `decay` event is emitted. Those
   * amounts are subtracted here alongside normal `claim`/`redeem` debits.
   */
  async deriveBalance(accountAddress) {
    const result = await this.pool.query(
      `SELECT event_type, event_data 
       FROM indexer_events 
       WHERE event_data->>'account' = $1
          OR event_data->>'user' = $1
       ORDER BY ledger ASC`,
      [accountAddress]
    );
    
    let balance = 0;
    for (const row of result.rows) {
      const data = row.event_data;
      switch (row.event_type) {
        case 'credit':
          balance += parseInt(data.value?.amount || 0);
          break;
        case 'claim':
        case 'redeem':
          balance -= parseInt(data.value?.amount || 0);
          break;
        case 'decay':
          // amount_decayed is stored as a string by _parseEventData
          balance -= parseInt(data.amount_decayed || 0);
          break;
      }
    }
    
    return balance;
  }

  /**
   * Return all decay events for a specific account, ordered newest-first.
   * Useful for displaying a point-expiry history to the user.
   *
   * @param {string} accountAddress  - On-chain address of the user.
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   */
  async getDecayEventsByAccount(accountAddress, limit = 50, offset = 0) {
    const result = await this.pool.query(
      `SELECT * FROM indexer_events
       WHERE event_type = 'decay'
         AND event_data->>'user' = $1
       ORDER BY ledger DESC
       LIMIT $2 OFFSET $3`,
      [accountAddress, limit, offset]
    );
    return result.rows;
  }

  /**
   * Return all decay-policy-set events for a specific campaign, ordered
   * newest-first. Useful for auditing the history of decay configuration.
   *
   * @param {string} campaignId
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   */
  async getDecayPolicyHistory(campaignId, limit = 50, offset = 0) {
    const result = await this.pool.query(
      `SELECT * FROM indexer_events
       WHERE event_type = 'decay_set'
         AND event_data->>'campaign_id' = $1
       ORDER BY ledger DESC
       LIMIT $2 OFFSET $3`,
      [String(campaignId), limit, offset]
    );
    return result.rows;
  }

  /**
   * Get history for an account
   */
  async getAccountHistory(accountAddress, limit = 50, offset = 0) {
    const result = await this.pool.query(
      `SELECT * FROM indexer_events 
       WHERE event_data->>'account' = $1 
       ORDER BY ledger DESC 
       LIMIT $2 OFFSET $3`,
      [accountAddress, limit, offset]
    );
    return result.rows;
  }
}
