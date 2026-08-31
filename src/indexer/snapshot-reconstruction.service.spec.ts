import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SnapshotReconstructionService } from './snapshot-reconstruction.service';
import { Payment, Bounty } from '../common/entities';

describe('SnapshotReconstructionService', () => {
  let service: SnapshotReconstructionService;

  const mockPaymentRepo = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  const mockBountyRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotReconstructionService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Bounty), useValue: mockBountyRepo },
      ],
    }).compile();

    service = module.get<SnapshotReconstructionService>(
      SnapshotReconstructionService
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
