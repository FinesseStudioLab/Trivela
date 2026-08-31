import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataWarehouseExportService } from './data-warehouse-export.service';
import { Bounty, Payment, User } from '../common/entities';

describe('DataWarehouseExportService', () => {
  let service: DataWarehouseExportService;

  const mockBountyRepo = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockPaymentRepo = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockUserRepo = {
    find: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataWarehouseExportService,
        { provide: getRepositoryToken(Bounty), useValue: mockBountyRepo },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<DataWarehouseExportService>(DataWarehouseExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should provide schema documentation', () => {
    const schema = service.getSchemaDocumentation();
    expect(schema.bounties).toBeDefined();
    expect(schema.payments).toBeDefined();
    expect(schema.users).toBeDefined();
  });

  it('should validate export counts', async () => {
    mockBountyRepo.count.mockResolvedValue(100);
    mockPaymentRepo.count.mockResolvedValue(50);
    mockUserRepo.count.mockResolvedValue(25);

    const validation = await service.validateExport();
    expect(validation.valid).toBeDefined();
  });
});
