/**
 * Integration tests for ContractEventListenerService (SSE event indexer).
 *
 * Uses a mock Soroban RPC server to exercise the three scenarios called out
 * in issue #1676:
 *   1. New events received — handler is invoked with the parsed ContractEvent.
 *   2. Duplicate events ignored — the same event ID is not processed twice.
 *   3. Reconnection after disconnect — a transient RPC error is tolerated and
 *      polling resumes on the next tick without losing state.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ContractEventListenerService,
  ContractEvent,
  EventHandler,
} from './contract-event-listener.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRawEvent(overrides: Partial<Record<string, any>> = {}): any {
  return {
    id: 'evt-001',
    type: 'fund',
    contractId: 'CCONTRACT123',
    topic: ['v1', 'fund'],
    value: { amount: 100 },
    ledger: 10,
    ledgerClosedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeModule(serverMock: object): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      ContractEventListenerService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            if (key === 'stellar.sorobanRpcUrl') return 'http://localhost:8000';
            if (key === 'stellar.escrowContractId') return 'CCONTRACT123';
            if (key === 'stellar.maintenancePoolContractId') return null;
            return null;
          }),
        },
      },
    ],
  })
    .overrideProvider(ContractEventListenerService)
    .useFactory({
      factory: (config: ConfigService) => {
        const svc = new ContractEventListenerService(config);
        // Inject the mock server so no real HTTP calls are made.
        (svc as any).server = serverMock;
        return svc;
      },
      inject: [ConfigService],
    })
    .compile();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ContractEventListenerService — integration', () => {
  let service: ContractEventListenerService;
  let mockServer: {
    getLatestLedger: jest.Mock;
    getEvents: jest.Mock;
  };

  beforeEach(async () => {
    mockServer = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 9 }),
      getEvents: jest.fn().mockResolvedValue({ events: [] }),
    };

    const module = await makeModule(mockServer);
    service = module.get<ContractEventListenerService>(
      ContractEventListenerService,
    );
  });

  afterEach(() => {
    service.stopListening();
    jest.clearAllMocks();
  });

  // ── 1. New events received ──────────────────────────────────────────────

  describe('new events received', () => {
    it('calls the registered handler when a new event arrives', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const eventHandler: EventHandler = {
        eventType: 'fund',
        handler,
        schemaVersions: [1],
      };
      service.registerHandler(eventHandler);

      mockServer.getEvents.mockResolvedValue({
        events: [makeRawEvent()],
      });

      // Trigger a single poll cycle directly (bypasses setInterval timing).
      await (service as any).pollEvents();

      expect(handler).toHaveBeenCalledTimes(1);
      const received: ContractEvent = handler.mock.calls[0][0];
      expect(received.id).toBe('evt-001');
      expect(received.type).toBe('fund');
      expect(received.contractId).toBe('CCONTRACT123');
      expect(received.schemaVersion).toBe(1);
    });

    it('passes parsed topics and data to the handler', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'withdraw', handler, schemaVersions: [1] });

      mockServer.getEvents.mockResolvedValue({
        events: [
          makeRawEvent({
            id: 'evt-002',
            type: 'withdraw',
            topic: ['v1', 'withdraw'],
            value: { amount: 50 },
          }),
        ],
      });

      await (service as any).pollEvents();

      expect(handler).toHaveBeenCalledTimes(1);
      const event: ContractEvent = handler.mock.calls[0][0];
      expect(event.topics).toContain('withdraw');
      expect(event.data).toEqual({ amount: 50 });
    });

    it('dispatches events to all handlers registered for that type', async () => {
      const h1 = jest.fn().mockResolvedValue(undefined);
      const h2 = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'fund', handler: h1, schemaVersions: [1] });
      service.registerHandler({ eventType: 'fund', handler: h2, schemaVersions: [1] });

      mockServer.getEvents.mockResolvedValue({ events: [makeRawEvent()] });
      await (service as any).pollEvents();

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('does not invoke a handler whose schema version does not match', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'fund', handler, schemaVersions: [2] });

      // Raw event reports schema version 1 (topic[0] === 'v1').
      mockServer.getEvents.mockResolvedValue({ events: [makeRawEvent()] });
      await (service as any).pollEvents();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── 2. Duplicate events ignored ─────────────────────────────────────────

  describe('duplicate events ignored', () => {
    it('does not invoke the handler a second time for the same event ID', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'fund', handler, schemaVersions: [1] });

      const rawEvent = makeRawEvent();
      mockServer.getEvents.mockResolvedValue({ events: [rawEvent] });

      // Poll twice with the same event in both responses.
      await (service as any).pollEvents();
      await (service as any).pollEvents();

      // The handler must only fire on the first poll.
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('processes a genuinely new event after a duplicate is skipped', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'fund', handler, schemaVersions: [1] });

      mockServer.getEvents.mockResolvedValueOnce({ events: [makeRawEvent({ id: 'evt-001' })] });
      // Second poll returns the same event PLUS a new one.
      mockServer.getEvents.mockResolvedValueOnce({
        events: [
          makeRawEvent({ id: 'evt-001' }),
          makeRawEvent({ id: 'evt-002' }),
        ],
      });

      await (service as any).pollEvents();
      await (service as any).pollEvents();

      expect(handler).toHaveBeenCalledTimes(2);
      const ids = handler.mock.calls.map((c: any[]) => c[0].id);
      expect(ids).toEqual(['evt-001', 'evt-002']);
    });
  });

  // ── 3. Reconnection after disconnect ────────────────────────────────────

  describe('reconnection after disconnect', () => {
    it('logs the error but does not throw when getEvents rejects', async () => {
      mockServer.getEvents.mockRejectedValue(new Error('Connection refused'));

      // Should resolve without throwing.
      await expect((service as any).pollEvents()).resolves.not.toThrow();
    });

    it('resumes processing new events after a transient RPC error', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler({ eventType: 'fund', handler, schemaVersions: [1] });

      // First poll: network error.
      mockServer.getEvents.mockRejectedValueOnce(new Error('ECONNRESET'));
      // Second poll: event arrives normally.
      mockServer.getEvents.mockResolvedValueOnce({ events: [makeRawEvent()] });

      await (service as any).pollEvents();
      await (service as any).pollEvents();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('advances latestLedger after a successful poll so the next poll starts from the right ledger', async () => {
      mockServer.getLatestLedger.mockResolvedValue({ sequence: 42 });
      mockServer.getEvents.mockResolvedValue({ events: [] });

      await (service as any).pollEvents();

      expect((service as any).latestLedger).toBe(42);
    });

    it('does not advance latestLedger when getLatestLedger itself fails', async () => {
      const before = (service as any).latestLedger;
      mockServer.getEvents.mockResolvedValue({ events: [] });
      mockServer.getLatestLedger.mockRejectedValue(new Error('timeout'));

      await (service as any).pollEvents();

      expect((service as any).latestLedger).toBe(before);
    });
  });
});
