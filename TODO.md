# Allowlist CSV import + operator allowlist management

- [ ] Inspect existing DB wiring (sqlite/pg) and add allowlists table + repository
- [ ] Implement server-side Merkle tree generation matching frontend (issue #294)
- [ ] Implement CSV import validation (G-address format, max rows/filesize) + invalid row reporting
- [ ] Implement POST /api/v1/campaigns/:id/allowlist/import
- [ ] Implement GET /api/v1/campaigns/:id/allowlist
- [ ] Implement GET /api/v1/campaigns/:id/allowlist/:address/proof
- [ ] Wire on-chain `set_merkle_root` during import (single operation) using admin nonce
- [ ] Update backend/openapi.yaml
- [ ] Add minimal tests for import parsing/validation + proof fetch
