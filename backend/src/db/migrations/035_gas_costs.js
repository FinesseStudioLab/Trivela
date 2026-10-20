export const version = 35;
export const description = 'Gas costs tracking table for XLM gas fees and USD costs';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gas_costs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash      TEXT    NOT NULL,
      contract_id  TEXT    NOT NULL,
      method       TEXT    NOT NULL,
      gas_cost     NUMERIC NOT NULL,
      xlm_price    NUMERIC,
      usd_cost     NUMERIC NOT NULL,
      recorded_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_gas_costs_tx_hash ON gas_costs(tx_hash);
    CREATE INDEX IF NOT EXISTS idx_gas_costs_contract_recorded ON gas_costs(contract_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_gas_costs_recorded_at ON gas_costs(recorded_at);
  `);
}
