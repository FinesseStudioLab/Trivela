import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WalletSigningService, SigningErrorType } from './wallet-signing.service';

describe('WalletSigningService', () => {
  let service: WalletSigningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletSigningService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WalletSigningService>(WalletSigningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should detect network mismatch', async () => {
    const error = await service.validateNetwork('testnet', 'mainnet');
    expect(error).toBeDefined();
    expect(error?.type).toBe(SigningErrorType.NETWORK_MISMATCH);
  });

  it('should detect account switch', async () => {
    const error = await service.validateAccount('GABC...', 'GXYZ...');
    expect(error).toBeDefined();
    expect(error?.type).toBe(SigningErrorType.ACCOUNT_SWITCHED);
  });

  it('should handle user rejection', () => {
    const error = service.handleSigningError(new Error('User rejected transaction'));
    expect(error.type).toBe(SigningErrorType.USER_REJECTED);
    expect(error.recoverable).toBe(true);
  });
});
