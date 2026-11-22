/**
 * On-chain transaction gas cost monitoring worker.
 * Records and aggregates XLM gas fee metrics across all submitted contract interactions.
 */

import { withSpan } from '../tracing.js';

export function createGasCostMonitoringJob({
  rpcPool,
  gasCostRepository,
  logger,
}) {
  return {
    /**
     * Process gas costs for a transaction
     */
    async recordGasCost(txHash, contractId, method, gasCost, xlmPrice) {
      return withSpan('gas.record', { txHash, contractId, method }, async (span) => {
        try {
          const record = {
            txHash,
            contractId,
            method,
            gasCost: Number(gasCost),
            xlmPrice: Number(xlmPrice || 0),
            usdCost: Number(gasCost) * Number(xlmPrice || 0),
            recordedAt: new Date(),
          };

          span.setAttribute('gas.cost', record.gasCost);
          span.setAttribute('usd.cost', record.usdCost);

          await gasCostRepository.insert(record);
          logger?.info?.({ txHash, gasCost: record.gasCost, usdCost: record.usdCost }, 'Gas cost recorded');
          return record;
        } catch (err) {
          logger?.error?.({ txHash, err: err.message }, 'Failed to record gas cost');
          throw err;
        }
      });
    },

    /**
     * Get gas cost aggregates for a contract
     */
    async getContractMetrics(contractId, days = 7) {
      return withSpan('gas.aggregate', { contractId, days }, async (span) => {
        try {
          const records = await gasCostRepository.getByContractId(contractId, days);

          const metrics = {
            contractId,
            totalGasCost: records.reduce((sum, r) => sum + r.gasCost, 0),
            totalUsdCost: records.reduce((sum, r) => sum + r.usdCost, 0),
            avgGasCost: records.length > 0 ? records.reduce((sum, r) => sum + r.gasCost, 0) / records.length : 0,
            transactionCount: records.length,
            methodBreakdown: {},
          };

          for (const record of records) {
            if (!metrics.methodBreakdown[record.method]) {
              metrics.methodBreakdown[record.method] = {
                count: 0,
                totalGas: 0,
                totalUsd: 0,
              };
            }
            metrics.methodBreakdown[record.method].count += 1;
            metrics.methodBreakdown[record.method].totalGas += record.gasCost;
            metrics.methodBreakdown[record.method].totalUsd += record.usdCost;
          }

          span.setAttribute('metrics.transaction_count', metrics.transactionCount);
          span.setAttribute('metrics.total_gas', metrics.totalGasCost);
          span.setAttribute('metrics.total_usd', metrics.totalUsdCost);

          return metrics;
        } catch (err) {
          logger?.error?.({ contractId, err: err.message }, 'Failed to aggregate gas metrics');
          throw err;
        }
      });
    },

    /**
     * Run periodic gas cost aggregation
     */
    async runAggregation() {
      return withSpan('gas.run_aggregation', {}, async (span) => {
        try {
          const contracts = await gasCostRepository.getDistinctContracts(1); // Last 24 hours
          const results = [];

          for (const contractId of contracts) {
            const metrics = await this.getContractMetrics(contractId, 1);
            results.push(metrics);
          }

          logger?.info?.({ contractCount: contracts.length }, 'Gas cost aggregation completed');
          return results;
        } catch (err) {
          logger?.error?.({ err: err.message }, 'Gas cost aggregation failed');
          throw err;
        }
      });
    },
  };
}
