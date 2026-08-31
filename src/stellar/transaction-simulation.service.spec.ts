import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TransactionSimulationService } from './transaction-simulation.service';

describe('TransactionSimulationService', () => {
  let service: TransactionSimulationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionSimulationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://soroban-testnet.stellar.org'),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionSimulationService>(TransactionSimulationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should provide user-friendly error messages', () => {
    const simulation = { success: false, error: 'contract error', errorType: 'contract' as const };
    const message = service.getUserFriendlyError(simulation);
    expect(message).toContain('Contract error');
  });
});
