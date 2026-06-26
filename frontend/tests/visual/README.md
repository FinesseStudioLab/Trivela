# Visual Regression Testing

Automated visual regression tests for Trivela UI components using Playwright and Storybook.

## Overview

Visual regression testing captures screenshots of UI components and compares them against baseline images to detect unintended visual changes. This helps catch:

- Unintended CSS changes
- Layout shifts from dependency updates
- Cross-browser rendering differences
- Component state display issues

## How It Works

1. **Storybook** provides isolated component stories with different states
2. **Playwright** navigates to each story and captures screenshots
3. **Snapshots** are compared pixel-by-pixel against baseline images
4. **Tests fail** if differences exceed the configured threshold (2% by default)

## Running Tests

### Prerequisites

```bash
# Install dependencies (from frontend directory)
npm install
```

### Local Development

```bash
# Run visual tests (starts Storybook automatically)
npm run test:visual

# Update baseline snapshots after intentional changes
npm run test:visual:update

# View detailed HTML report of test results
npm run test:visual:report
```

### First-Time Setup

The first time you run tests, you need to generate baseline snapshots:

```bash
npm run test:visual:update
```

This creates snapshot images in `tests/visual/__snapshots__/` that will be used for future comparisons.

## Adding New Tests

Visual tests automatically run for all stories listed in `tests/visual/storybook.spec.ts`. To add a new component:

1. **Create a Storybook story** (if it doesn't exist):

```typescript
// src/stories/MyComponent.stories.tsx
export default {
  title: 'Components/MyComponent',
  component: MyComponent,
};

export const Default = {
  args: {
    prop1: 'value',
  },
};

export const Loading = {
  args: {
    isLoading: true,
  },
};
```

2. **Add the story to the test file**:

```typescript
// tests/visual/storybook.spec.ts
const stories = [
  // ... existing stories
  { id: 'components-mycomponent--default', name: 'MyComponent - Default' },
  { id: 'components-mycomponent--loading', name: 'MyComponent - Loading' },
];
```

3. **Generate snapshots**:

```bash
npm run test:visual:update
```

4. **Commit the snapshots** with your changes.

## Story ID Format

Story IDs follow the pattern: `<group>-<component>--<story>`

- `components-header--default` → Components/Header/Default story
- `components-campaigncard--active` → Components/CampaignCard/Active story

Find story IDs in the Storybook URL bar or hover over stories in the sidebar.

## CI Integration

Visual tests run automatically in CI via GitHub Actions. The workflow:

1. Installs dependencies
2. Builds Storybook
3. Runs Playwright visual tests
4. Uploads diff images if tests fail

**Note:** Visual tests are currently non-blocking (continue-on-error: true) due to platform differences between local development (macOS/darwin) and CI (Linux). Linux-specific snapshots will be generated in a follow-up commit.

### Handling CI Failures

If visual tests fail in CI:

1. **Review the diff images** in the GitHub Actions artifacts
2. **If changes are expected** (e.g., intentional design update):
   ```bash
   npm run test:visual:update
   git add tests/visual/__snapshots__
   git commit -m "chore: update visual regression baselines"
   ```
3. **If changes are unexpected**, investigate and fix the root cause

## Configuration

Visual test settings are in `playwright.visual.config.ts`:

- **Viewport**: 1280x720 (desktop)
- **Browser**: Chromium (primary), Firefox/Safari optional
- **Threshold**: 2% pixel difference allowed
- **Workers**: 1 on CI (consistent), parallel locally
- **Timeout**: 30s per test

## Troubleshooting

### Tests fail with "Storybook not available"

Ensure Storybook runs successfully:

```bash
npm run storybook
# Visit http://localhost:6006 and verify stories load
```

### Snapshots differ on different machines

Font rendering and OS-level differences can cause minor variations. The 2% threshold accounts for this, but you may need to:

- Generate baselines on the same OS as CI (Linux)
- Use Docker for consistent rendering
- Increase `maxDiffPixelRatio` in config (not recommended)

### Too many snapshots to review

Focus on critical user paths first:

- Primary navigation (Header)
- Key campaign displays (CampaignCard)
- Transaction states (TransactionStatus)

Add lower-priority components gradually.

## Best Practices

1. **Keep stories focused** - One visual concern per story
2. **Test different states** - Loading, error, empty, populated
3. **Update baselines intentionally** - Always review diffs before updating
4. **Commit snapshots** - Snapshots are source code, commit them with changes
5. **Run locally first** - Don't wait for CI to catch visual issues
6. **Document breaking changes** - Note when updating baselines in commit messages

## Resources

- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Storybook Best Practices](https://storybook.js.org/docs/writing-stories)
- [Visual Regression Testing Guide](https://playwright.dev/docs/test-snapshots#visual-comparisons)
