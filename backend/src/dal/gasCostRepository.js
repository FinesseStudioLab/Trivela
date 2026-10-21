/**
 * Gas cost repository for recording and querying transaction gas fees.
 */

export function createGasCostRepository(db) {
  return {
    async insert(record) {
      const { txHash, contractId, method, gasCost, xlmPrice, usdCost, recordedAt } = record;
      return db.exec(
        `INSERT INTO gas_costs (tx_hash, contract_id, method, gas_cost, xlm_price, usd_cost, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [txHash, contractId, method, gasCost, xlmPrice, usdCost, recordedAt.toISOString()],
      );
    },

    async getByContractId(contractId, days = 7) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      return db.query(
        `SELECT * FROM gas_costs
         WHERE contract_id = ? AND recorded_at >= ?
         ORDER BY recorded_at DESC`,
        [contractId, cutoff],
      );
    },

    async getDistinctContracts(days = 1) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const rows = db.query(
        `SELECT DISTINCT contract_id FROM gas_costs WHERE recorded_at >= ? LIMIT 100`,
        [cutoff],
      );
      return rows.map((r) => r.contract_id);
    },

    async getMetrics(contractId, days = 7) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const result = db.query(
        `SELECT
           COUNT(*) as transaction_count,
           SUM(gas_cost) as total_gas_cost,
           SUM(usd_cost) as total_usd_cost,
           AVG(gas_cost) as avg_gas_cost
         FROM gas_costs
         WHERE contract_id = ? AND recorded_at >= ?`,
        [contractId, cutoff],
      );
      return result[0] || { transaction_count: 0, total_gas_cost: 0, total_usd_cost: 0, avg_gas_cost: 0 };
    },
  };
}

export function createPgGasCostRepository(pgClient) {
  return {
    async insert(record) {
      const { txHash, contractId, method, gasCost, xlmPrice, usdCost, recordedAt } = record;
      await pgClient.query(
        `INSERT INTO gas_costs (tx_hash, contract_id, method, gas_cost, xlm_price, usd_cost, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [txHash, contractId, method, gasCost, xlmPrice, usdCost, recordedAt],
      );
    },

    async getByContractId(contractId, days = 7) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await pgClient.query(
        `SELECT * FROM gas_costs
         WHERE contract_id = $1 AND recorded_at >= $2
         ORDER BY recorded_at DESC`,
        [contractId, cutoff],
      );
      return result.rows;
    },

    async getDistinctContracts(days = 1) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await pgClient.query(
        `SELECT DISTINCT contract_id FROM gas_costs WHERE recorded_at >= $1 LIMIT 100`,
        [cutoff],
      );
      return result.rows.map((r) => r.contract_id);
    },

    async getMetrics(contractId, days = 7) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await pgClient.query(
        `SELECT
           COUNT(*) as transaction_count,
           SUM(gas_cost) as total_gas_cost,
           SUM(usd_cost) as total_usd_cost,
           AVG(gas_cost) as avg_gas_cost
         FROM gas_costs
         WHERE contract_id = $1 AND recorded_at >= $2`,
        [contractId, cutoff],
      );
      const row = result.rows[0] || {};
      return {
        transaction_count: parseInt(row.transaction_count, 10) || 0,
        total_gas_cost: parseFloat(row.total_gas_cost) || 0,
        total_usd_cost: parseFloat(row.total_usd_cost) || 0,
        avg_gas_cost: parseFloat(row.avg_gas_cost) || 0,
      };
    },
  };
}
