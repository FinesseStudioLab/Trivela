import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BASE_FEE, rpc } from '@stellar/stellar-sdk';
import { AppConfig } from '../config/configuration';

export interface FeeStrategyConfig {
  baseFee: number;
  maxFee: number;
  congestionThreshold: number;
  bumpMultiplier: number;
  maxRetries: number;
}

export interface NetworkConditions {
  averageFee: number;
  ledgerCapacityUsage: number;
  recentFailureRate: number;
  isHighCongestion: boolean;
}

export interface FeeEstimate {
  fee: number;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

@Injectable()
export class FeeStrategyService {
  private readonly logger = new Logger(FeeStrategyService.name);
  private readonly server: rpc.Server;
  
  private readonly config: FeeStrategyConfig = {
    baseFee: Number(BASE_FEE),
    maxFee: 1000000, // 0.1 XLM max
    congestionThreshold: 0.8, // 80% ledger capacity
    bumpMultiplier: 2.0,
    maxRetries: 3,
  };

  // Cache network conditions for 30 seconds
  private conditionsCache: {
    conditions: NetworkConditions | null;
    timestamp: number;
  } = { conditions: null, timestamp: 0 };

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const stellar = this.configService.get('stellar', { infer: true });
    this.server = new rpc.Server(stellar.sorobanRpcUrl, {
      allowHttp: stellar.sorobanRpcUrl.startsWith('http://'),
    });
  }

  /**
   * Get current network conditions by analyzing recent ledgers
   */
  async getNetworkConditions(): Promise<NetworkConditions> {
    const now = Date.now();
    
    // Return cached conditions if less than 30 seconds old
    if (this.conditionsCache.conditions && 
        now - this.conditionsCache.timestamp < 30000) {
      return this.conditionsCache.conditions;
    }

    try {
      // Get latest ledgers to analyze conditions
      const latestLedger = await this.server.getLatestLedger();
      
      // Simplified fee estimation based on network activity
      // In production, this would analyze actual transaction fees from recent ledgers
      const networkLoad = 0.7; // Placeholder - would come from actual ledger analysis
      
      let totalFees = 0;
      let totalTxCount = 10;
      let totalCapacityUsage = networkLoad;
      let failedTxCount = 0;

      // Estimate current network fees
      totalFees = this.config.baseFee * totalTxCount * (1 + networkLoad);
      
      if (networkLoad > 0.9) {
        failedTxCount = Math.floor(totalTxCount * 0.05);
      }

      const averageFee = totalTxCount > 0 ? totalFees / totalTxCount : this.config.baseFee;
      const ledgerCapacityUsage = totalCapacityUsage;
      const recentFailureRate = totalTxCount > 0 ? failedTxCount / totalTxCount : 0;
      const isHighCongestion = ledgerCapacityUsage > this.config.congestionThreshold;

      const conditions: NetworkConditions = {
        averageFee,
        ledgerCapacityUsage,
        recentFailureRate,
        isHighCongestion,
      };

      // Cache the conditions
      this.conditionsCache = {
        conditions,
        timestamp: now,
      };

      this.logger.debug(
        `Network conditions: avgFee=${averageFee}, capacity=${(ledgerCapacityUsage * 100).toFixed(1)}%, ` +
        `failureRate=${(recentFailureRate * 100).toFixed(1)}%, highCongestion=${isHighCongestion}`
      );

      return conditions;
    } catch (error) {
      this.logger.warn(`Failed to get network conditions: ${error.message}`);
      
      // Return conservative defaults
      return {
        averageFee: this.config.baseFee * 2,
        ledgerCapacityUsage: 0.5,
        recentFailureRate: 0.1,
        isHighCongestion: true,
      };
    }
  }

  /**
   * Estimate optimal fee based on current network conditions
   */
  async estimateFee(): Promise<FeeEstimate> {
    const conditions = await this.getNetworkConditions();
    
    let fee = this.config.baseFee;
    let reason = 'base fee';
    let confidence: 'low' | 'medium' | 'high' = 'high';

    if (conditions.isHighCongestion) {
      // During high congestion, use network average + buffer
      fee = Math.max(
        conditions.averageFee * 1.2,
        this.config.baseFee * 2
      );
      reason = 'high congestion detected';
      confidence = 'medium';
    } else if (conditions.recentFailureRate > 0.05) {
      // If recent failure rate is high, bump fee preemptively
      fee = Math.max(
        conditions.averageFee * 1.1,
        this.config.baseFee * 1.5
      );
      reason = 'elevated failure rate';
      confidence = 'medium';
    } else if (conditions.ledgerCapacityUsage > 0.6) {
      // Medium congestion - moderate bump
      fee = Math.max(
        conditions.averageFee,
        this.config.baseFee * 1.2
      );
      reason = 'moderate network usage';
      confidence = 'high';
    }

    // Enforce maximum fee limit
    if (fee > this.config.maxFee) {
      fee = this.config.maxFee;
      reason += ' (capped at maximum)';
      confidence = 'low';
    }

    // Round to nearest 100 stroops for cleaner fees
    fee = Math.ceil(fee / 100) * 100;

    this.logger.debug(`Fee estimate: ${fee} stroops (${reason})`);

    return { fee, reason, confidence };
  }

  /**
   * Implement fee bump strategy for stuck transactions
   */
  async bumpFee(originalFee: number, attempt: number): Promise<FeeEstimate> {
    if (attempt >= this.config.maxRetries) {
      throw new Error(`Maximum fee bump attempts (${this.config.maxRetries}) exceeded`);
    }

    // Exponential backoff with multiplier
    const multiplier = Math.pow(this.config.bumpMultiplier, attempt);
    let bumpedFee = Math.floor(originalFee * multiplier);
    
    // Get current conditions to inform bump strategy
    const conditions = await this.getNetworkConditions();
    
    // During extreme congestion, be more aggressive
    if (conditions.isHighCongestion && conditions.recentFailureRate > 0.1) {
      bumpedFee = Math.max(bumpedFee, conditions.averageFee * 1.5);
    }

    // Enforce maximum
    if (bumpedFee > this.config.maxFee) {
      bumpedFee = this.config.maxFee;
    }

    const reason = `fee bump attempt ${attempt + 1} (${multiplier}x original)`;
    const confidence = attempt < 2 ? 'medium' : 'low';

    this.logger.warn(`Bumping fee from ${originalFee} to ${bumpedFee} stroops (${reason})`);

    return { fee: bumpedFee, reason, confidence };
  }

  /**
   * Check if a transaction is likely stuck and needs fee bump
   */
  async isTransactionStuck(txHash: string, submittedAt: Date): Promise<boolean> {
    try {
      // Check if transaction exists
      const tx = await this.server.getTransaction(txHash);
      
      if (tx.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        return false; // Transaction found, not stuck
      }

      // If more than 5 minutes have passed, consider it stuck
      const ageMinutes = (Date.now() - submittedAt.getTime()) / (1000 * 60);
      
      if (ageMinutes > 5) {
        this.logger.warn(`Transaction ${txHash} appears stuck after ${ageMinutes.toFixed(1)} minutes`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking transaction status: ${error.message}`);
      // Assume stuck if we can't check
      return true;
    }
  }

  /**
   * Get fee strategy configuration
   */
  getConfig(): FeeStrategyConfig {
    return { ...this.config };
  }

  /**
   * Update fee strategy configuration
   */
  updateConfig(updates: Partial<FeeStrategyConfig>): void {
    Object.assign(this.config, updates);
    this.logger.log(`Fee strategy config updated: ${JSON.stringify(updates)}`);
  }
}