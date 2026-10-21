/**
 * Tests for Event Indexer Service
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { EventIndexer } from './event-indexer.js';

describe('EventIndexer', () => {
  let indexer;
  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/trivela_test';
  const testRpcUrl = process.env.TEST_RPC_URL || 'https://soroban-testnet.stellar.org';
  const testContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

  before(async () => {
    indexer = new EventIndexer({
      rpcUrl: testRpcUrl,
      databaseUrl: testDbUrl,
      contractId: testContractId,
      pollIntervalMs: 1000
    });
  });

  after(async () => {
    if (indexer) {
      await indexer.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize database schema', async () => {
      await indexer.initialize();
      
      // Verify tables exist
      const result = await indexer.pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('indexer_events', 'indexer_cursor')
      `);
      
      assert.strictEqual(result.rows.length, 2, 'Should create both tables');
    });

    it('should load persisted cursor on restart', async () => {
      const client = await indexer.pool.connect();
      try {
        await client.query('INSERT INTO indexer_cursor (id, cursor) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET cursor = $1', ['12345']);
      } finally {
        client.release();
      }
      
      const newIndexer = new EventIndexer({
        rpcUrl: testRpcUrl,
        databaseUrl: testDbUrl,
        contractId: testContractId
      });
      
      await newIndexer.initialize();
      assert.strictEqual(newIndexer.cursor, '12345', 'Should load cursor from database');
      await newIndexer.stop();
    });
  });

  describe('event ingestion', () => {
    it('should handle empty event responses', async () => {
      mock.method(indexer.server, 'getEvents', async () => ({ events: [] }));
      
      await indexer.ingest();
      // Should not throw
    });

    it('should insert events with idempotent upsert', async () => {
      const mockEvents = [
        {
          ledger: 1000,
          txHash: 'abc123',
          pagingToken: '0',
          contractId: testContractId,
          topic: [{ value: { toString: () => 'credit' } }],
          value: { value: { amount: '1000', account: 'GTEST' } }
        }
      ];
      
      mock.method(indexer.server, 'getEvents', async () => ({
        events: mockEvents,
        latestLedger: 1000
      }));
      
      await indexer.ingest();
      
      const result = await indexer.pool.query('SELECT * FROM indexer_events WHERE ledger = 1000');
      assert.strictEqual(result.rows.length, 1, 'Should insert one event');
      
      // Re-ingest same event
      await indexer.ingest();
      const result2 = await indexer.pool.query('SELECT * FROM indexer_events WHERE ledger = 1000');
      assert.strictEqual(result2.rows.length, 1, 'Should not duplicate event (idempotent)');
    });

    it('should update cursor after successful ingestion', async () => {
      const mockEvents = [
        {
          ledger: 2000,
          txHash: 'def456',
          pagingToken: '0',
          contractId: testContractId,
          topic: [{ value: { toString: () => 'claim' } }],
          value: { value: { amount: '500' } }
        }
      ];
      
      mock.method(indexer.server, 'getEvents', async () => ({
        events: mockEvents,
        latestLedger: 2000
      }));
      
      await indexer.ingest();
      
      const result = await indexer.pool.query('SELECT cursor FROM indexer_cursor WHERE id = 1');
      assert.strictEqual(result.rows[0].cursor, '2000', 'Should update cursor to latest ledger');
    });
  });

  describe('backfill', () => {
    it('should backfill events from ledger range', async () => {
      let callCount = 0;
      mock.method(indexer.server, 'getEvents', async (request) => {
        callCount++;
        const currentLedger = parseInt(request.startLedger || '100');
        
        if (currentLedger >= 200) {
          return { events: [] };
        }
        
        return {
          events: [{
            ledger: currentLedger,
            txHash: `backfill${currentLedger}`,
            pagingToken: '0',
            contractId: testContractId,
            topic: [{ value: { toString: () => 'redeem' } }],
            value: { value: { amount: '100' } }
          }],
          latestLedger: currentLedger + 50
        };
      });
      
      await indexer.backfill(100, 200);
      
      assert.ok(callCount > 0, 'Should make at least one RPC call');
    });
  });

  describe('balance derivation', () => {
    it('should derive balance from event history', async () => {
      const account = 'GBALANCE';
      const client = await indexer.pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Credit 1000
        await client.query(
          `INSERT INTO indexer_events (ledger, tx_hash, op_index, event_type, event_data, contract_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [3000, 'tx1', 0, 'credit', JSON.stringify({ value: { amount: '1000', account } }), testContractId]
        );
        
        // Claim 300
        await client.query(
          `INSERT INTO indexer_events (ledger, tx_hash, op_index, event_type, event_data, contract_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [3001, 'tx2', 0, 'claim', JSON.stringify({ value: { amount: '300', account } }), testContractId]
        );
        
        // Credit 500
        await client.query(
          `INSERT INTO indexer_events (ledger, tx_hash, op_index, event_type, event_data, contract_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [3002, 'tx3', 0, 'credit', JSON.stringify({ value: { amount: '500', account } }), testContractId]
        );
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
      const balance = await indexer.deriveBalance(account);
      assert.strictEqual(balance, 1200, 'Balance should be 1000 + 500 - 300 = 1200');
    });
  });

  describe('query APIs', () => {
    it('should query events by type', async () => {
      const events = await indexer.getEventsByType('credit', 10, 0);
      assert.ok(Array.isArray(events), 'Should return array of events');
    });

    it('should query events by ledger range', async () => {
      const events = await indexer.getEventsByLedgerRange(1000, 2000, 10);
      assert.ok(Array.isArray(events), 'Should return array of events');
      
      for (const event of events) {
        assert.ok(event.ledger >= 1000 && event.ledger <= 2000, 'Events should be within range');
      }
    });

    it('should get account history', async () => {
      const account = 'GBALANCE';
      const history = await indexer.getAccountHistory(account, 10, 0);
      
      assert.ok(Array.isArray(history), 'Should return array');
      assert.ok(history.length > 0, 'Should have history for test account');
    });
  });

  describe('restart resilience', () => {
    it('should resume from cursor after restart', async () => {
      const cursor1 = indexer.cursor;
      
      // Simulate restart
      await indexer.stop();
      
      const newIndexer = new EventIndexer({
        rpcUrl: testRpcUrl,
        databaseUrl: testDbUrl,
        contractId: testContractId
      });
      
      await newIndexer.initialize();
      assert.strictEqual(newIndexer.cursor, cursor1, 'Should resume from same cursor');
      await newIndexer.stop();
    });
  });
});
