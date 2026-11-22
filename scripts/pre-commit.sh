#!/bin/bash
# Pre-commit hook script enforcing Prettier, ESLint, and Rustfmt
set -e

echo "==> Running pre-commit checks..."

# 1. Prettier
echo "--> Checking Prettier formatting..."
npx prettier --check "backend/src/**/*.{js,json}" "frontend/src/**/*.{js,jsx,ts,tsx}" "**/*.{md,yaml,yml}" || {
  echo "❌ Prettier check failed. Run 'npm run format' to fix."
  exit 1
}

# 2. ESLint
echo "--> Checking ESLint..."
npm run lint || {
  echo "❌ ESLint check failed. Run 'npm run lint:fix' or fix reported issues."
  exit 1
}

# 3. Rustfmt
echo "--> Checking Rustfmt..."
cargo fmt --all -- --check || {
  echo "❌ Rustfmt check failed. Run 'cargo fmt' to fix."
  exit 1
}

echo "✅ All pre-commit checks passed!"
exit 0
