import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SimulationResult {
  success: boolean;
  cost?: {
    cpuInstructions: number;
    memoryBytes: number;
    feeStroops: number;
  };
  error?: string;
  errorType?: 'contract' | 'auth' | 'resources' | 'unknown';
  returnValue?: any;
}

export interface PreflightResult {
  canProceed: boolean;
  simulation: SimulationResult;
  warnings: string[];
  estimatedFee: number;
}

@Injectable()
export class TransactionSimulationService {
  private readonly logger = new Logger(TransactionSimulationService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Simulate contract call before submission
   */
  async simulateTransaction(
    transaction: any,
  ): Promise<SimulationResult> {
    const sorobanRpcUrl = this.configService.get('stellar.sorobanRpcUrl');

    try {
      const response = await fetch(sorobanRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'simulateTransaction',
          params: {
            transaction: transaction.toXDR(),
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        return {
          success: false,
          error: data.error.message || 'Simulation failed',
          errorType: this.categorizeError(data.error),
        };
      }

      const result = data.result;

      // Check for contract errors
      if (result.error) {
        return {
          success: false,
          error: result.error,
          errorType: 'contract',
        };
      }

      // Extract cost information
      const cost = {
        cpuInstructions: result.cost?.cpuInsns || 0,
        memoryBytes: result.cost?.memBytes || 0,
        feeStroops: result.transactionData?.fee || 0,
      };

      this.logger.debug(
        `Simulation successful - CPU: ${cost.cpuInstructions}, Memory: ${cost.memoryBytes}, Fee: ${cost.feeStroops}`,
      );

      return {
        success: true,
        cost,
        returnValue: result.results?.[0]?.retval,
      };
    } catch (error) {
      this.logger.error(`Simulation error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        errorType: 'unknown',
      };
    }
  }

  /**
   * Run preflight checks before submission
   */
  async preflightTransaction(
    transaction: any,
    accountBalance: number,
  ): Promise<PreflightResult> {
    const warnings: string[] = [];

    // Simulate first
    const simulation = await this.simulateTransaction(transaction);

    if (!simulation.success) {
      return {
        canProceed: false,
        simulation,
        warnings: [
          `Simulation failed: ${simulation.error}`,
          'Transaction will likely fail if submitted',
        ],
        estimatedFee: 0,
      };
    }

    const estimatedFee = simulation.cost?.feeStroops || 0;

    // Check if user has enough balance
    if (accountBalance < estimatedFee) {
      warnings.push(
        `Insufficient balance. Need ${estimatedFee} stroops, have ${accountBalance} stroops`,
      );
      return {
        canProceed: false,
        simulation,
        warnings,
        estimatedFee,
      };
    }

    // Warn if fee is unusually high
    if (estimatedFee > 1000000) {
      // > 0.1 XLM
      warnings.push(
        `High transaction fee: ${(estimatedFee / 10000000).toFixed(2)} XLM`,
      );
    }

    // Warn if CPU usage is high
    if (simulation.cost && simulation.cost.cpuInstructions > 50000000) {
      warnings.push('High CPU usage detected - transaction may be expensive');
    }

    return {
      canProceed: true,
      simulation,
      warnings,
      estimatedFee,
    };
  }

  /**
   * Categorize simulation errors
   */
  private categorizeError(error: any): SimulationResult['errorType'] {
    const message = error.message || String(error);

    if (message.includes('auth') || message.includes('unauthorized')) {
      return 'auth';
    }

    if (message.includes('resource') || message.includes('limit')) {
      return 'resources';
    }

    if (message.includes('contract')) {
      return 'contract';
    }

    return 'unknown';
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyError(simulation: SimulationResult): string {
    if (simulation.success) {
      return '';
    }

    switch (simulation.errorType) {
      case 'contract':
        return `Contract error: ${simulation.error}. Please check your inputs and try again.`;
      case 'auth':
        return 'Authorization error. Please ensure you have permission to perform this action.';
      case 'resources':
        return 'Resource limit exceeded. This operation requires too many resources.';
      default:
        return `Transaction failed: ${simulation.error}`;
    }
  }
}
