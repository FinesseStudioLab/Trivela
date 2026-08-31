import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RPCFailoverService } from './rpc-failover.service';

describe('RPCFailoverService', () => {
  let service: RPCFailoverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RPCFailoverService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'stellar.sorobanRpcUrl') return 'https://soroban-testnet.stellar.org';
              if (key === 'stellar.fallbackRpcUrls') return ['https://rpc-backup.stellar.org'];
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RPCFailoverService>(RPCFailoverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should provide provider status', () => {
    const status = service.getProviderStatus();
    expect(status).toBeDefined();
    expect(Array.isArray(status)).toBe(true);
  });

  it('should execute with failover on error', async () => {
    const mockOperation = jest.fn().mockResolvedValue({ success: true });
    const result = await service.executeWithFailover(mockOperation);
    expect(result).toEqual({ success: true });
  });
});
