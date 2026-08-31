import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MaterializedViewsService } from './materialized-views.service';
import { Bounty, User, Payment } from '../common/entities';

describe('MaterializedViewsService', () => {
  let service: MaterializedViewsService;

  const mockBountyRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };

  const mockUserRepo = { find: jest.fn() };
  const mockPaymentRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterializedViewsService,
        { provide: getRepositoryToken(Bounty), useValue: mockBountyRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
      ],
    }).compile();

    service = module.get<MaterializedViewsService>(MaterializedViewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
