import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Payment, Bounty } from '../common/entities';
import { PaymentStatus, BountyStatus } from '../common/enums';

export interface SnapshotBalance {
  userId: string;
  balance: number;
  ledgerSequence: number;
  timestamp: Date;
  transactionCount: number;
}

export interface SnapshotOptions {
  ledgerSequence?: number;
  timestamp?: Date;
  userIds?: string[];
}

@Injectable()
export class SnapshotReconstructionService {
  private readonly logger = new Logger(SnapshotReconstructionService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Bounty)
    private readonly bountyRepo: Repository<Bounty>,
  ) {}

  async reconstructBalances(options: SnapshotOptions): Promise<SnapshotBalance[]> {
    const { timestamp, userIds } = options;

    if (!timestamp) {
      throw new Error('Timestamp is required for balance reconstruction');
    }

    this.logger.log(`Reconstructing balances at ${timestamp.toISOString()}`);

    let query = this.paymentRepo
      .createQueryBuilder('payment')
      .where('payment.createdAt <= :timestamp', { timestamp })
      .andWhere('payment.status = :status', { status: PaymentStatus.CONFIRMED });

    if (userIds && userIds.length > 0) {
      query = query.andWhere('payment.recipientId IN (:...userIds)', { userIds });
    }

    const payments = await query.getMany();

    const balanceMap = new Map<string, { balance: number; count: number }>();

    for (const payment of payments) {
      if (!payment.recipientId) continue;

      const existing = balanceMap.get(payment.recipientId) || { balance: 0, count: 0 };
      existing.balance += parseFloat(payment.amount);
      existing.count += 1;
      balanceMap.set(payment.recipientId, existing);
    }

    const snapshots: SnapshotBalance[] = [];
    for (const [userId, data] of balanceMap.entries()) {
      snapshots.push({
        userId,
        balance: data.balance,
        ledgerSequence: 0,
        timestamp,
        transactionCount: data.count,
      });
    }

    this.logger.log(`Reconstructed ${snapshots.length} user balances`);
    return snapshots;
  }

  async reconstructForUser(userId: string, timestamp: Date): Promise<SnapshotBalance> {
    const snapshots = await this.reconstructBalances({ timestamp, userIds: [userId] });
    return snapshots[0] || {
      userId,
      balance: 0,
      ledgerSequence: 0,
      timestamp,
      transactionCount: 0,
    };
  }
}