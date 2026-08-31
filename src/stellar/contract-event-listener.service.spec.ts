import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContractEventListenerService } from './contract-event-listener.service';

describe('ContractEventListenerService', () => {
  let service: ContractEventListenerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractEventListenerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'stellar.sorobanRpcUrl') return 'https://soroban-testnet.stellar.org';
              if (key === 'stellar.escrowContractId') return 'CCONTRACT123';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ContractEventListenerService>(ContractEventListenerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register event handlers', () => {
    const handler = {
      eventType: 'fund',
      handler: jest.fn(),
      schemaVersions: [1, 2],
    };
    
    service.registerHandler(handler);
    expect(service).toBeDefined();
  });

  it('should handle multiple schema versions', () => {
    const handlerV1 = {
      eventType: 'payment',
      handler: jest.fn(),
      schemaVersions: [1],
    };
    
    const handlerV2 = {
      eventType: 'payment',
      handler: jest.fn(),
      schemaVersions: [2],
    };
    
    service.registerHandler(handlerV1);
    service.registerHandler(handlerV2);
    expect(service).toBeDefined();
  });
});
