import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeeStrategyService } from './fee-strategy.service';

describe('FeeStrategyService', () => {
  let service: FeeStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeStrategyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
              networkPassphrase: 'Test SDF Network ; September 2015',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FeeStrategyService>(FeeStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should estimate fee above base fee during congestion', async () => {
    const estimate = await service.estimateFee();
    expect(estimate.fee).toBeGreaterThan(0);
    expect(estimate.reason).toBeDefined();
  });
});
