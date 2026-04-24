# Release Process

This document defines the release process for Trivela, including versioning policy, release checklist, and artifact management.

## Versioning Policy

Trivela follows **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`

- **MAJOR** – Breaking changes (contract upgrades, API incompatibilities)
- **MINOR** – New features (backward compatible)
- **PATCH** – Bug fixes (backward compatible)

### Examples

- `0.1.0` → `0.2.0` – New feature (e.g., new API endpoint)
- `0.1.0` → `0.1.1` – Bug fix (e.g., rate limit fix)
- `0.1.0` → `1.0.0` – Breaking change (e.g., contract migration)

### Pre-release Versions

For testing before release:

- `0.1.0-alpha.1` – Alpha release
- `0.1.0-beta.1` – Beta release
- `0.1.0-rc.1` – Release candidate

## Release Checklist

### 1. Prepare Release Branch

```bash
# Create release branch from main
git checkout main
git pull origin main
git checkout -b release/v0.2.0

# Update version numbers
npm version minor --workspaces --no-git-tag-version
# or for patch: npm version patch --workspaces --no-git-tag-version
# or for major: npm version major --workspaces --no-git-tag-version
```

### 2. Update Changelog

Edit `CHANGELOG.md` (create if doesn't exist):

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2024-04-24

### Added

- New campaign filtering by status
- API endpoint for campaign statistics
- Error code documentation

### Changed

- Improved rate limiting algorithm
- Updated Stellar SDK to v14.1.0

### Fixed

- Fixed CORS header handling for multiple origins
- Fixed campaign pagination offset calculation

### Security

- Added API key rotation guidance

## [0.1.0] - 2024-04-01

### Added

- Initial release
- Campaign CRUD endpoints
- Rewards contract integration
- Frontend React app
```

### 3. Run Full Test Suite

```bash
# Run all tests
npm run test

# Expected output:
# ✓ Contracts: cargo test --workspace
# ✓ Backend: npm run test --workspace=backend
# ✓ Frontend: npm run test --workspace=frontend
```

If any tests fail, fix them before proceeding.

### 4. Build All Artifacts

```bash
# Build contracts, backend, frontend
npm run build

# Verify outputs:
# - contracts/rewards/target/wasm32-unknown-unknown/release/*.wasm
# - backend/dist/ (if applicable)
# - frontend/dist/
```

### 5. Verify CI/CD Pipeline

- Push release branch to GitHub
- Verify all GitHub Actions workflows pass
- Check that Docker image builds successfully (if applicable)

```bash
git push origin release/v0.2.0
# Wait for GitHub Actions to complete
```

### 6. Create Release Tag

```bash
# Tag the release
git tag -a v0.2.0 -m "Release v0.2.0

- New campaign filtering
- Improved rate limiting
- Error code documentation"

# Push tag
git push origin v0.2.0
```

### 7. Create GitHub Release

1. Go to [Releases](https://github.com/FinesseStudioLab/Trivela/releases)
2. Click "Draft a new release"
3. Select tag `v0.2.0`
4. Title: `Release v0.2.0`
5. Description: Copy from `CHANGELOG.md`
6. Attach artifacts:
   - Contract WASM files
   - Frontend build (optional)
7. Click "Publish release"

### 8. Merge Release Branch

```bash
# Create pull request
git push origin release/v0.2.0

# On GitHub:
# 1. Create PR from release/v0.2.0 to main
# 2. Title: "Release v0.2.0"
# 3. Reference changelog in description
# 4. Get approval from maintainer
# 5. Merge with "Create a merge commit"

# Locally:
git checkout main
git pull origin main
git branch -d release/v0.2.0
```

### 9. Deploy to Production (Optional)

If deploying immediately after release:

```bash
# Backend
docker build -t trivela-backend:v0.2.0 backend/
docker push <registry>/trivela-backend:v0.2.0

# Frontend
npm run build:frontend
# Deploy frontend/dist to CDN

# Contracts (if new version)
export STELLAR_NETWORK=mainnet
bash ./scripts/deploy-testnet.sh
```

## Release Artifacts

### Smart Contracts

- **Location**: `contracts/*/target/wasm32-unknown-unknown/release/*.wasm`
- **Naming**: `trivela_rewards_v0.2.0.wasm`, `trivela_campaign_v0.2.0.wasm`
- **Storage**: Attach to GitHub release
- **Deployment**: Use Stellar CLI to deploy to network

### Backend

- **Docker Image**: `trivela-backend:v0.2.0`
- **Registry**: Docker Hub or private registry
- **Deployment**: Pull and run on production server

### Frontend

- **Build Output**: `frontend/dist/`
- **Deployment**: Upload to CDN (Vercel, Netlify, S3+CloudFront)
- **Versioning**: Tag build with git commit hash or version

## Hotfix Releases

For urgent bug fixes:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/v0.1.1

# Fix the bug
# Update version: npm version patch --workspaces --no-git-tag-version
# Update CHANGELOG.md

# Test
npm run test

# Tag and release (follow steps 6-8 above)
git tag -a v0.1.1 -m "Hotfix v0.1.1: Fix rate limit bug"
git push origin v0.1.1
```

## Rollback Procedure

If a release has critical issues:

1. **Identify issue** – Verify the problem is in the release
2. **Create hotfix** – Fix the issue on a new branch
3. **Release hotfix** – Follow hotfix release process
4. **Communicate** – Notify users of the issue and fix

Example:

```bash
# If v0.2.0 has a critical bug
git checkout -b hotfix/v0.2.1
# Fix the bug
npm version patch --workspaces --no-git-tag-version
# Test, tag, and release v0.2.1
```

## Release Communication

### Before Release

- Announce in project discussions
- Highlight breaking changes
- Provide migration guide if needed

### After Release

- Post release notes in discussions
- Update documentation
- Notify dependent projects

## Maintenance Releases

### Long-term Support (LTS)

For critical bug fixes to older versions:

```bash
# Checkout release tag
git checkout v0.1.0

# Create maintenance branch
git checkout -b maintenance/v0.1.x

# Fix bug
# Update version: npm version patch --workspaces --no-git-tag-version

# Tag and release
git tag -a v0.1.2 -m "Maintenance release v0.1.2"
git push origin v0.1.2
```

## Automation

### GitHub Actions Workflow

Consider adding a release workflow (`.github/workflows/release.yml`):

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm run test
      - name: Build artifacts
        run: npm run build
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            contracts/rewards/target/wasm32-unknown-unknown/release/*.wasm
            contracts/campaign/target/wasm32-unknown-unknown/release/*.wasm
```

## Support

For release questions, open an issue on [GitHub](https://github.com/FinesseStudioLab/Trivela/issues).
