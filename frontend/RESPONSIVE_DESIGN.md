# Mobile-Responsive Design Guidelines (#867)

Trivela is designed mobile-first with progressive enhancement for larger screens.

## Breakpoints

- **Mobile**: 0 – 768px
- **Tablet**: 769px – 1024px
- **Desktop**: 1025px+

## Mobile-First CSS

Write styles for mobile first, then enhance for larger screens:

```css
/* Mobile (default) */
.card {
  display: block;
  padding: 12px;
}

/* Tablet and up */
@media (min-width: 769px) {
  .card {
    padding: 16px;
  }
}

/* Desktop and up */
@media (min-width: 1025px) {
  .card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 24px;
  }
}
```

## Touch-Friendly UI

On mobile, ensure interactive elements meet WCAG guidelines:

- **Minimum touch target**: 48×48px
- **Spacing**: At least 12px between interactive elements
- **Font size**: ≥ 16px (prevents zoom on iOS)

```css
button {
  min-height: 48px;
  min-width: 48px;
}
```

## Responsive Text

Use `clamp()` for fluid typography:

```css
h1 {
  font-size: clamp(1.5rem, 4vw, 2rem);
}
```

## Safe Areas

For notched devices (iPhone X+), use CSS safe-area:

```css
body {
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}
```

## Landscape Orientation

Handle landscape on mobile:

```css
@media (max-height: 600px) and (orientation: landscape) {
  h1, h2, h3 {
    margin: 0.25rem 0;
  }
}
```

## Testing

Test with:

- Chrome DevTools device emulation
- Real iOS/Android devices
- Different orientations (portrait, landscape)
- Various screen sizes (320px–1440px)

## Service Worker / Offline

The PWA service worker caches essential assets. See [PwaStatus.jsx](frontend/src/components/PwaStatus.jsx) for offline UI.
