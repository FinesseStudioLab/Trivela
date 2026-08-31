# Accessibility (a11y) Testing

## Overview

Automated accessibility testing ensures Trivela meets WCAG 2.1 Level AA standards. Tests run in CI on every PR and fail the build on critical violations.

## Test Coverage

### Automated Checks (via axe-core)

| Test                 | Standard    | Status |
| -------------------- | ----------- | ------ |
| Homepage             | WCAG 2.1 AA | ✅     |
| Campaign list        | WCAG 2.1 AA | ✅     |
| Campaign detail      | WCAG 2.1 AA | ✅     |
| Navigation           | WCAG 2.1 AA | ✅     |
| Forms & inputs       | WCAG 2.1 AA | ✅     |
| Keyboard navigation  | WCAG 2.1 AA | ✅     |
| Color contrast       | WCAG 2.1 AA | ✅     |
| Images (alt text)    | WCAG 2.1 A  | ✅     |
| ARIA attributes      | WCAG 2.1 AA | ✅     |
| Heading hierarchy    | WCAG 2.1 A  | ✅     |
| Button/link names    | WCAG 2.1 A  | ✅     |
| Mobile touch targets | WCAG 2.1 AA | ✅     |

### Violation Severity Levels

**CI Build Behavior**:

- ❌ **Critical**: Build fails immediately
- ❌ **Serious**: Build fails immediately
- ⚠️ **Moderate**: Reported, build continues
- ℹ️ **Minor**: Reported, build continues

## Running Tests

### Locally (all a11y tests)

```bash
npm run test:a11y --workspace=frontend
```

### Specific page

```bash
npx playwright test tests/e2e/accessibility.spec.ts -g "Homepage"
```

### With UI mode (interactive debugging)

```bash
npx playwright test tests/e2e/accessibility.spec.ts --ui
```

### In CI

Accessibility tests run automatically in the `accessibility` job after the main frontend build.

## Viewing Results

### Test report

```bash
npx playwright show-report
```

### Console output

Tests log detailed violation information including:

- Rule ID and description
- Impact level (critical/serious/moderate/minor)
- Help URL for remediation
- Affected HTML elements
- Failure summary

Example output:

```
🔍 Accessibility Scan: Homepage
   Critical: 0
   Serious:  0
   Moderate: 2
   Minor:    1

⚠️  2 moderate violations found (not failing build)
```

## Common Violations & Fixes

### 1. Missing Alt Text on Images

**Issue**: `<img>` without `alt` attribute  
**Fix**:

```tsx
// ❌ Bad
<img src="/logo.png" />

// ✅ Good
<img src="/logo.png" alt="Trivela logo" />

// ✅ Decorative image
<img src="/decoration.png" alt="" />
```

### 2. Low Color Contrast

**Issue**: Text color too similar to background  
**Minimum ratios**:

- Normal text: 4.5:1
- Large text (18pt+ or 14pt+ bold): 3:1

**Fix**:

```css
/* ❌ Bad - insufficient contrast */
.text {
  color: #777;
  background: #fff;
}

/* ✅ Good - meets WCAG AA */
.text {
  color: #595959;
  background: #fff;
}
```

**Tool**: Use browser DevTools or https://contrast-ratio.com

### 3. Missing Form Labels

**Issue**: Input fields without associated labels  
**Fix**:

```tsx
// ❌ Bad
<input type="text" placeholder="Name" />

// ✅ Good - explicit label
<label htmlFor="name">Name</label>
<input id="name" type="text" />

// ✅ Good - implicit label
<label>
  Name
  <input type="text" />
</label>

// ✅ Good - aria-label
<input type="text" aria-label="Name" />
```

### 4. Incorrect Heading Hierarchy

**Issue**: Skipping heading levels (h1 → h3)  
**Fix**:

```tsx
// ❌ Bad
<h1>Page Title</h1>
<h3>Section</h3> {/* Skips h2 */}

// ✅ Good
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>
```

### 5. Buttons Without Accessible Names

**Issue**: Button with icon only, no text or aria-label  
**Fix**:

```tsx
// ❌ Bad
<button>
  <IconClose />
</button>

// ✅ Good - visible text
<button>
  <IconClose /> Close
</button>

// ✅ Good - aria-label
<button aria-label="Close">
  <IconClose />
</button>

// ✅ Good - sr-only text
<button>
  <IconClose />
  <span className="sr-only">Close</span>
</button>
```

### 6. No Focus Indicators

**Issue**: Focused elements have no visible indicator  
**Fix**:

```css
/* ❌ Bad */
button:focus {
  outline: none;
}

/* ✅ Good */
button:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}
```

### 7. Invalid ARIA Usage

**Issue**: Incorrect ARIA attributes  
**Fix**:

```tsx
// ❌ Bad - invalid role
<div role="invalid-role">...</div>

// ❌ Bad - conflicting roles
<button role="link">...</button>

// ✅ Good - valid role
<div role="alert">...</div>

// ✅ Good - use semantic HTML
<button>...</button> {/* No role needed */}
```

### 8. Small Touch Targets (Mobile)

**Issue**: Interactive elements < 44x44px  
**Fix**:

```css
/* ❌ Bad */
.icon-button {
  width: 24px;
  height: 24px;
}

/* ✅ Good */
.icon-button {
  width: 44px;
  height: 44px;
  /* Icon inside can be smaller */
}

/* ✅ Good - padding increases hit area */
.icon-button {
  width: 24px;
  height: 24px;
  padding: 10px;
}
```

## Manual Testing Checklist

Automated tests catch ~30-40% of accessibility issues. Manual testing is essential:

- [ ] **Keyboard navigation**: Tab through entire page
  - All interactive elements reachable
  - Focus order logical
  - No keyboard traps
  - Enter/Space activate buttons/links
- [ ] **Screen reader**: Test with NVDA (Windows) or VoiceOver (Mac)
  - All content announced
  - Form labels announced
  - Button/link purposes clear
  - Page structure conveyed
- [ ] **Zoom**: Test at 200% zoom
  - No content cut off
  - No horizontal scrolling
  - All features remain usable
- [ ] **Color blindness**: Test with color blind simulator
  - Information not conveyed by color alone
  - Sufficient contrast maintained
- [ ] **Motion**: Test with reduced motion preference
  - Animations respect `prefers-reduced-motion`
  - No essential content lost

## Browser Extensions

Helpful tools for manual testing:

- **axe DevTools** - Chrome/Firefox extension for accessibility auditing
- **WAVE** - Visual accessibility checker
- **Lighthouse** - Accessibility score in Chrome DevTools
- **ColorZilla** - Color picker for contrast checking
- **HeadingsMap** - Visualize heading structure

## Resources

### Standards

- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

### Testing

- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)

### Guides

- [WebAIM Quick Reference](https://webaim.org/resources/quickref/)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

## CI Integration

### GitHub Actions Workflow

Located in `.github/workflows/frontend-ci.yml`:

```yaml
accessibility:
  name: Accessibility (axe) Checks
  runs-on: ubuntu-latest
  needs: frontend
  steps:
    - name: Run accessibility tests
      run: npm run test:a11y --workspace=frontend
```

### Pull Request Checks

- ✅ All checks must pass before merge
- 🔍 PR comments show violation details
- 📊 GitHub Step Summary displays results

## Fixing Violations

When CI fails due to accessibility violations:

1. **Review the error logs** in GitHub Actions
2. **Identify the affected elements** from the HTML snippets
3. **Follow the help URL** provided by axe for guidance
4. **Apply the fix** using examples in this document
5. **Test locally** with `npm run test:a11y`
6. **Re-run CI** to verify the fix

## Continuous Improvement

### Monthly Review

- Review moderate/minor violations
- Prioritize fixes based on user impact
- Update this documentation with new patterns

### Quarterly Audit

- Run comprehensive manual accessibility audit
- Test with real assistive technology users
- Review and update automated test coverage

### Reporting Issues

Found an accessibility issue not caught by tests? Please:

1. File a GitHub issue with the `accessibility` label
2. Include steps to reproduce
3. Note the assistive technology affected
4. Suggest a fix if possible

## Maintenance

- **Owner**: Frontend team
- **Review frequency**: After each frontend change
- **Last updated**: 2024-01-15
- **Next review**: 2024-04-15
