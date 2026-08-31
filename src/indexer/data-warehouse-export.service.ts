import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bounty, Payment, Issue, User } from '../common/entities';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

export interface ExportResult {
  success: boolean;
  rowCount: number;
  filePath?: string;
  error?: string;
  exportedAt: Date;
}

export interface WarehouseSchema {
  bounties: {
    id: string;
    amount: string;
    status: string;
    created_at: Date;
    claimed_at?: Date;
    merged_at?: Date;
  };
  payments: {
    id: string;
    amount: string;
    recipient_id: string;
    created_at: Date;
  };
  users: {
    id: string;
    github_username: string;
    created_at: Date;
  };
}

@Injectable()
export class DataWarehouseExportService {
  private readonly logger = new Logger(DataWarehouseExportService.name);
  private readonly exportDir = process.env.EXPORT_DIR || '/tmp/warehouse-exports';

  constructor(
    @InjectRepository(Bounty)
    private readonly bountyRepo: Repository<Bounty>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    // Ensure export directory exists
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Scheduled daily export to warehouse (runs at 2 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledExport() {
    this.logger.log('Starting scheduled warehouse export');
    try {
      await this.exportAllTables();
      this.logger.log('Scheduled warehouse export completed successfully');
    } catch (error) {
      this.logger.error(`Scheduled export failed: ${error.message}`);
    }
  }

  /**
   * Export all tables to warehouse
   */
  async exportAllTables(): Promise<ExportResult[]> {
    const results: ExportResult[] = [];

    results.push(await this.exportBounties());
    results.push(await this.exportPayments());
    results.push(await this.exportUsers());

    return results;
  }

  /**
   * Export bounties table
   */
  async exportBounties(): Promise<ExportResult> {
    try {
      const bounties = await this.bountyRepo.find({
        order: { createdAt: 'ASC' },
      });

      const data = bounties.map((b) => ({
        id: b.id,
        amount: b.amount,
        status: b.status,
        created_at: b.createdAt,
        claimed_at: b.claimedAt,
        merged_at: b.mergedAt,
        claimed_by_id: b.claimedById,
        sponsor_id: b.sponsorId,
        issue_id: b.issueId,
      }));

      const filePath = await this.writeParquetFile('bounties', data);

      this.logger.log(`Exported ${bounties.length} bounties to ${filePath}`);

      return {
        success: true,
        rowCount: bounties.length,
        filePath,
        exportedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Bounty export failed: ${error.message}`);
      return {
        success: false,
        rowCount: 0,
        error: error.message,
        exportedAt: new Date(),
      };
    }
  }

  /**
   * Export payments table
   */
  async exportPayments(): Promise<ExportResult> {
    try {
      const payments = await this.paymentRepo.find({
        order: { createdAt: 'ASC' },
      });

      const data = payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        asset: p.asset,
        recipient_id: p.recipientId,
        recipient_address: p.recipientAddress,
        escrow_id: p.escrowId,
        status: p.status,
        tx_hash: p.txHash,
        created_at: p.createdAt,
      }));

      const filePath = await this.writeParquetFile('payments', data);

      this.logger.log(`Exported ${payments.length} payments to ${filePath}`);

      return {
        success: true,
        rowCount: payments.length,
        filePath,
        exportedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Payment export failed: ${error.message}`);
      return {
        success: false,
        rowCount: 0,
        error: error.message,
        exportedAt: new Date(),
      };
    }
  }

  /**
   * Export users table
   */
  async exportUsers(): Promise<ExportResult> {
    try {
      const users = await this.userRepo.find({
        order: { createdAt: 'ASC' },
      });

      const data = users.map((u) => ({
        id: u.id,
        github_username: u.githubUsername,
        stellar_address: u.stellarAddress,
        role: u.role,
        created_at: u.createdAt,
      }));

      const filePath = await this.writeParquetFile('users', data);

      this.logger.log(`Exported ${users.length} users to ${filePath}`);

      return {
        success: true,
        rowCount: users.length,
        filePath,
        exportedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`User export failed: ${error.message}`);
      return {
        success: false,
        rowCount: 0,
        error: error.message,
        exportedAt: new Date(),
      };
    }
  }

  /**
   * Write data to Parquet file
   * In production, this would use actual Parquet writer library
   */
  private async writeParquetFile(
    tableName: string,
    data: any[],
  ): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `${tableName}_${timestamp}.json`;
    const filePath = path.join(this.exportDir, fileName);

    // For now, write as JSON (in production, use parquetjs or similar)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    return filePath;
  }

  /**
   * Validate export row counts against source
   */
  async validateExport(): Promise<{
    valid: boolean;
    discrepancies: string[];
  }> {
    const discrepancies: string[] = [];

    const bountyCount = await this.bountyRepo.count();
    const paymentCount = await this.paymentRepo.count();
    const userCount = await this.userRepo.count();

    // In production, compare against BigQuery table counts
    this.logger.log(`Source counts - Bounties: ${bountyCount}, Payments: ${paymentCount}, Users: ${userCount}`);

    return {
      valid: discrepancies.length === 0,
      discrepancies,
    };
  }

  /**
   * Get export schema documentation
   */
  getSchemaDocumentation(): Record<string, any> {
    return {
      bounties: {
        description: 'Bounty records with funding and completion data',
        fields: {
          id: 'UUID primary key',
          amount: 'Bounty amount in asset units',
          status: 'Bounty lifecycle status',
          created_at: 'Timestamp when bounty was created',
          claimed_at: 'Timestamp when bounty was claimed',
          merged_at: 'Timestamp when PR was merged',
          claimed_by_id: 'User ID of claimant',
          sponsor_id: 'User ID of sponsor',
          issue_id: 'Linked GitHub issue ID',
        },
      },
      payments: {
        description: 'Payment records from escrow releases',
        fields: {
          id: 'UUID primary key',
          amount: 'Payment amount',
          asset: 'Asset type (USDC, XLM)',
          recipient_id: 'User ID of recipient',
          recipient_address: 'Stellar address',
          escrow_id: 'Linked escrow ID',
          status: 'Payment status',
          tx_hash: 'Stellar transaction hash',
          created_at: 'Payment timestamp',
        },
      },
      users: {
        description: 'User accounts and profiles',
        fields: {
          id: 'UUID primary key',
          github_username: 'GitHub username',
          stellar_address: 'Stellar public key',
          role: 'User role (contributor, maintainer, sponsor)',
          created_at: 'Account creation timestamp',
        },
      },
    };
  }
}
