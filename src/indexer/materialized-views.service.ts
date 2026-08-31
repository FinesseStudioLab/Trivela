import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bounty, User, Payment } from '../common/entities';
import { BountyStatus } from '../common/enums';

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  totalEarnings: number;
  completedBounties: number;
  successRate: number;
  lastUpdated: Date;
}

export interface BalanceSnapshot {
  userId: string;
  totalEarnings: number;
  pendingEarnings: number;
  completedPayments: number;
  lastUpdated: Date;
}

@Injectable()
export class MaterializedViewsService {
  private readonly logger = new Logger(MaterializedViewsService.name);
  
  // In-memory materialized views with TTL
  private leaderboardCache: {
    entries: LeaderboardEntry[];
    lastRefresh: Date;
    ttlMs: number;
  } = {
    entries: [],
    lastRefresh: new Date(0),
    ttlMs: 60000, // 1 minute TTL
  };

  private balanceCache: Map<string, BalanceSnapshot> = new Map();
  private balanceCacheTTL = 30000; // 30 seconds

  constructor(
    @InjectRepository(Bounty)
    private readonly bountyRepo: Repository<Bounty>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {
    // Initialize background refresh
    this.startBackgroundRefresh();
  }

  /**
   * Get leaderboard with sub-100ms reads from materialized view
   */
  async getLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    const now = Date.now();
    const cacheAge = now - this.leaderboardCache.lastRefresh.getTime();

    // Return cached if fresh
    if (cacheAge < this.leaderboardCache.ttlMs && this.leaderboardCache.entries.length > 0) {
      return this.leaderboardCache.entries.slice(0, limit);
    }

    // Refresh if stale
    await this.refreshLeaderboard();
    return this.leaderboardCache.entries.slice(0, limit);
  }

  /**
   * Get user balance with sub-100ms read from materialized view
   */
  async getUserBalance(userId: string): Promise<BalanceSnapshot> {
    const cached = this.balanceCache.get(userId);
    const now = Date.now();

    if (cached && now - cached.lastUpdated.getTime() < this.balanceCacheTTL) {
      return cached;
    }

    // Refresh this user's balance
    const balance = await this.computeUserBalance(userId);
    this.balanceCache.set(userId, balance);
    return balance;
  }

  /**
   * Incrementally update leaderboard when bounty completes
   */
  async incrementalUpdateForBounty(bountyId: string): Promise<void> {
    const bounty = await this.bountyRepo.findOne({
      where: { id: bountyId },
    });

    if (!bounty?.claimedById) return;

    // Update user's balance
    const balance = await this.computeUserBalance(bounty.claimedById);
    this.balanceCache.set(bounty.claimedById, balance);

    // Update leaderboard entry
    await this.updateLeaderboardEntry(bounty.claimedById);

    this.logger.debug(
      `Incrementally updated views for user ${bounty.claimedById} after bounty ${bountyId}`
    );
  }

  /**
   * Incrementally update when payment confirms
   */
  async incrementalUpdateForPayment(paymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });

    if (!payment?.recipientId) return;

    // Update user's balance
    const balance = await this.computeUserBalance(payment.recipientId);
    this.balanceCache.set(payment.recipientId, balance);

    // Update leaderboard entry
    await this.updateLeaderboardEntry(payment.recipientId);

    this.logger.debug(
      `Incrementally updated views for user ${payment.recipientId} after payment ${paymentId}`
    );
  }

  /**
   * Full refresh of leaderboard from source data
   */
  private async refreshLeaderboard(): Promise<void> {
    const startTime = Date.now();

    // Query all users with earnings
    const results = await this.bountyRepo
      .createQueryBuilder('bounty')
      .select('bounty.claimedById', 'userId')
      .addSelect('SUM(CAST(bounty.amount AS DECIMAL))', 'totalEarnings')
      .addSelect('COUNT(*)', 'totalBounties')
      .addSelect(
        'COUNT(CASE WHEN bounty.status IN (:...completedStatuses) THEN 1 END)',
        'completedBounties'
      )
      .where('bounty.claimedById IS NOT NULL')
      .setParameter('completedStatuses', [BountyStatus.PAID, BountyStatus.MERGED])
      .groupBy('bounty.claimedById')
      .orderBy('totalEarnings', 'DESC')
      .getRawMany();

    const entries: LeaderboardEntry[] = results.map((row, index) => ({
      userId: row.userId,
      rank: index + 1,
      totalEarnings: parseFloat(row.totalEarnings || '0'),
      completedBounties: parseInt(row.completedBounties, 10),
      successRate: 
        parseInt(row.totalBounties, 10) > 0
          ? (parseInt(row.completedBounties, 10) / parseInt(row.totalBounties, 10)) * 100
          : 0,
      lastUpdated: new Date(),
    }));

    this.leaderboardCache = {
      entries,
      lastRefresh: new Date(),
      ttlMs: 60000,
    };

    const elapsed = Date.now() - startTime;
    this.logger.log(`Refreshed leaderboard: ${entries.length} entries in ${elapsed}ms`);
  }

  /**
   * Update single leaderboard entry incrementally
   */
  private async updateLeaderboardEntry(userId: string): Promise<void> {
    const userStats = await this.bountyRepo
      .createQueryBuilder('bounty')
      .select('SUM(CAST(bounty.amount AS DECIMAL))', 'totalEarnings')
      .addSelect('COUNT(*)', 'totalBounties')
      .addSelect(
        'COUNT(CASE WHEN bounty.status IN (:...completedStatuses) THEN 1 END)',
        'completedBounties'
      )
      .where('bounty.claimedById = :userId', { userId })
      .setParameter('completedStatuses', [BountyStatus.PAID, BountyStatus.MERGED])
      .getRawOne();

    if (!userStats) return;

    const entry: LeaderboardEntry = {
      userId,
      rank: 0, // Will be recomputed
      totalEarnings: parseFloat(userStats.totalEarnings || '0'),
      completedBounties: parseInt(userStats.completedBounties, 10),
      successRate:
        parseInt(userStats.totalBounties, 10) > 0
          ? (parseInt(userStats.completedBounties, 10) / parseInt(userStats.totalBounties, 10)) * 100
          : 0,
      lastUpdated: new Date(),
    };

    // Update in cache
    const existingIndex = this.leaderboardCache.entries.findIndex(
      (e) => e.userId === userId
    );

    if (existingIndex >= 0) {
      this.leaderboardCache.entries[existingIndex] = entry;
    } else {
      this.leaderboardCache.entries.push(entry);
    }

    // Re-sort and update ranks
    this.leaderboardCache.entries.sort((a, b) => b.totalEarnings - a.totalEarnings);
    this.leaderboardCache.entries.forEach((e, i) => {
      e.rank = i + 1;
    });
  }

  /**
   * Compute user balance from source events
   */
  private async computeUserBalance(userId: string): Promise<BalanceSnapshot> {
    const payments = await this.paymentRepo.find({
      where: { recipientId: userId },
    });

    const totalEarnings = payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0
    );

    const pendingBounties = await this.bountyRepo.count({
      where: {
        claimedById: userId,
        status: BountyStatus.CLAIMED,
      },
    });

    const pendingEarnings = await this.bountyRepo
      .createQueryBuilder('bounty')
      .select('COALESCE(SUM(CAST(bounty.amount AS DECIMAL)), 0)', 'total')
      .where('bounty.claimedById = :userId', { userId })
      .andWhere('bounty.status IN (:...statuses)', {
        statuses: [BountyStatus.CLAIMED, BountyStatus.IN_REVIEW, BountyStatus.MERGED],
      })
      .getRawOne();

    return {
      userId,
      totalEarnings,
      pendingEarnings: parseFloat(pendingEarnings?.total || '0'),
      completedPayments: payments.length,
      lastUpdated: new Date(),
    };
  }

  /**
   * Start background refresh of materialized views
   */
  private startBackgroundRefresh(): void {
    // Refresh leaderboard every 2 minutes
    setInterval(async () => {
      try {
        await this.refreshLeaderboard();
      } catch (error) {
        this.logger.error(`Background leaderboard refresh failed: ${error.message}`);
      }
    }, 120000);

    // Clean stale balance cache every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = now - this.balanceCacheTTL * 10;

      for (const [userId, balance] of this.balanceCache.entries()) {
        if (balance.lastUpdated.getTime() < staleThreshold) {
          this.balanceCache.delete(userId);
        }
      }
    }, 300000);
  }

  /**
   * Force refresh all materialized views
   */
  async forceRefresh(): Promise<void> {
    this.logger.log('Forcing full refresh of all materialized views');
    await this.refreshLeaderboard();
    this.balanceCache.clear();
  }
}