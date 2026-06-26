# A/B Testing Framework for Campaign Variants

Implements comprehensive A/B testing infrastructure for Trivela campaigns addressing issue #624.

## Features

- **Database Schema**: Migration 010 adds tables for variants, assignments, and results
- **Smart Assignment**: Deterministic hash-based algorithm with traffic weight distribution
- **Statistical Analysis**: Z-test calculations with p-values and significance testing
- **REST API**: Complete CRUD operations under `/api/v1/campaigns/:id/variants`
- **Authentication**: API key required, integrated with rate limiting
- **Testing**: Comprehensive unit tests with good coverage

## API Endpoints

- `POST /campaigns/:id/variants` - Create variant
- `GET /campaigns/:id/variants` - List variants
- `PUT /campaigns/:id/variants/:variantId` - Update variant
- `DELETE /campaigns/:id/variants/:variantId` - Delete variant
- `POST /campaigns/:id/variants/assign` - Assign user to variant
- `GET /campaigns/:id/variants/assignment/:userId` - Get assignment
- `POST /campaigns/:id/variants/results` - Track results
- `GET /campaigns/:id/variants/results/:metric` - Get analytics

## Usage Example

Create control and test variants, assign users based on traffic weights, track conversion metrics,
and analyze results with statistical significance testing.

## Technical Details

- Deterministic user assignment ensures consistency
- Traffic weights control user distribution (e.g. 50% control, 50% variant)
- Statistical significance calculated using z-test for proportions
- Sticky assignments prevent user confusion across sessions
- Comprehensive validation with Zod schemas

## Files Changed

**New**: 6 files including migration, repository, service, routes, tests, docs **Modified**: 3 files
for schema validation and integration

Production-ready implementation with full documentation in IMPLEMENTATION_ISSUE_624.md

Closes #624
