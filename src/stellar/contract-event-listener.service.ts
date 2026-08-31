import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rpc } from '@stellar/stellar-sdk';

export interface ContractEvent {
  id: string;
  type: string;
  contractId: string;
  topics: string[];
  data: any;
  ledger: number;
  timestamp: Date;
  schemaVersion: number;
}

export interface EventHandler {
  eventType: string;
  handler: (event: ContractEvent) => Promise<void>;
  schemaVersions: number[];
}

@Injectable()
export class ContractEventListenerService implements OnModuleInit {
  private readonly logger = new Logger(ContractEventListenerService.name);
  private readonly server: rpc.Server;
  private readonly handlers = new Map<string, EventHandler[]>();
  private isListening = false;
  private latestLedger = 0;

  constructor(private readonly configService: ConfigService) {
    const sorobanRpcUrl = this.configService.get('stellar.sorobanRpcUrl');
    this.server = new rpc.Server(sorobanRpcUrl, {
      allowHttp: sorobanRpcUrl.startsWith('http://'),
    });
  }

  async onModuleInit() {
    // Start listening for events
    await this.startListening();
  }

  /**
   * Register event handler with schema version support
   */
  registerHandler(handler: EventHandler): void {
    const existing = this.handlers.get(handler.eventType) || [];
    existing.push(handler);
    this.handlers.set(handler.eventType, existing);
    this.logger.log(
      `Registered handler for ${handler.eventType} (schema versions: ${handler.schemaVersions.join(', ')})`,
    );
  }

  /**
   * Start listening for contract events
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      this.logger.warn('Already listening for events');
      return;
    }

    this.isListening = true;
    this.logger.log('Starting contract event listener');

    // Get latest ledger
    const latestLedgerInfo = await this.server.getLatestLedger();
    this.latestLedger = latestLedgerInfo.sequence;

    // Poll for new events every 5 seconds
    setInterval(async () => {
      try {
        await this.pollEvents();
      } catch (error) {
        this.logger.error(`Error polling events: ${error.message}`);
      }
    }, 5000);
  }

  /**
   * Poll for new events
   */
  private async pollEvents(): Promise<void> {
    try {
      const contractIds = this.getMonitoredContracts();
      
      for (const contractId of contractIds) {
        const events = await this.fetchContractEvents(
          contractId,
          this.latestLedger + 1,
        );

        for (const event of events) {
          await this.processEvent(event);
        }
      }

      // Update latest ledger
      const latestLedgerInfo = await this.server.getLatestLedger();
      this.latestLedger = latestLedgerInfo.sequence;
    } catch (error) {
      this.logger.error(`Error polling events: ${error.message}`);
    }
  }

  /**
   * Fetch contract events from Soroban
   */
  private async fetchContractEvents(
    contractId: string,
    startLedger: number,
  ): Promise<ContractEvent[]> {
    // Use Soroban RPC getEvents method
    const response = await this.server.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: [contractId],
        },
      ],
    });

    return response.events.map((e: any) => this.parseEvent(e));
  }

  /**
   * Parse raw Soroban event into typed ContractEvent
   */
  private parseEvent(rawEvent: any): ContractEvent {
    // Extract schema version from event data
    const schemaVersion = this.extractSchemaVersion(rawEvent);

    return {
      id: rawEvent.id,
      type: rawEvent.type,
      contractId: rawEvent.contractId,
      topics: rawEvent.topic,
      data: rawEvent.value,
      ledger: rawEvent.ledger,
      timestamp: new Date(rawEvent.ledgerClosedAt),
      schemaVersion,
    };
  }

  /**
   * Extract schema version from event (supports multiple versions)
   */
  private extractSchemaVersion(rawEvent: any): number {
    // Check if event includes schema version in topics
    if (rawEvent.topic && rawEvent.topic[0]) {
      const versionTopic = rawEvent.topic[0];
      if (versionTopic.startsWith('v')) {
        return parseInt(versionTopic.substring(1), 10);
      }
    }
    
    // Default to version 1 for backward compatibility
    return 1;
  }

  /**
   * Process event and dispatch to registered handlers
   */
  private async processEvent(event: ContractEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];

    if (handlers.length === 0) {
      this.logger.debug(`No handlers registered for event type: ${event.type}`);
      return;
    }

    for (const handlerConfig of handlers) {
      // Check if handler supports this schema version
      if (!handlerConfig.schemaVersions.includes(event.schemaVersion)) {
        this.logger.warn(
          `Skipping handler for ${event.type} - schema version ${event.schemaVersion} not supported (supports: ${handlerConfig.schemaVersions.join(', ')})`,
        );
        continue;
      }

      try {
        await handlerConfig.handler(event);
        this.logger.debug(
          `Successfully processed ${event.type} event (schema v${event.schemaVersion})`,
        );
      } catch (error) {
        this.logger.error(
          `Error processing ${event.type} event: ${error.message}`,
        );
      }
    }
  }

  /**
   * Get list of contracts to monitor
   */
  private getMonitoredContracts(): string[] {
    return [
      this.configService.get('stellar.escrowContractId'),
      this.configService.get('stellar.maintenancePoolContractId'),
    ].filter(Boolean);
  }

  /**
   * Stop listening for events
   */
  stopListening(): void {
    this.isListening = false;
    this.logger.log('Stopped contract event listener');
  }
}
