export const version = 3;
export const description = 'Add contract_id for on-chain campaign anchoring';

export function up(db) {
  const columns = db.prepare('PRAGMA table_info(campaigns)').all();
  const hasContractId = columns.some((col) => col.name === 'contract_id');
  if (!hasContractId) {
    db.exec(`
      ALTER TABLE campaigns ADD COLUMN contract_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_campaigns_contract_id ON campaigns(contract_id);
    `);
  }
}
