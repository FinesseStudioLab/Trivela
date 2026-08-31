# Trivela development helpers
.PHONY: dev dev-down codegen codegen-check

# Issue #616: one-command local devnet (contracts + backend + frontend)
dev:
	docker compose --profile devnet up --build

dev-down:
	docker compose --profile devnet down -v

# Issue #615: regenerate TypeScript client from openapi.yaml
codegen:
	cd sdk/client && npm install --silent && npm run generate

# Fail if the committed generated client is out of date
codegen-check:
	cd sdk/client && npm install --silent && npm run check-drift
