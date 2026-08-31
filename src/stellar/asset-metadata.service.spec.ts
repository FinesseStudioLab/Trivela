import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AssetMetadataService } from './asset-metadata.service';

describe('AssetMetadataService', () => {
  let service: AssetMetadataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetMetadataService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org'),
          },
        },
      ],
    }).compile();

    service = module.get<AssetMetadataService>(AssetMetadataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should build trustline operation', () => {
    const operation = service.buildTrustlineOperation('USDC', 'GISSUER...');
    expect(operation.type).toBe('changeTrust');
    expect(operation.asset.code).toBe('USDC');
  });
});
