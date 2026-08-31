// Tests for Open Graph and Twitter Card meta correctness (#948).
//
// Validates that PageMeta emits all tags required by the OG and Twitter Card
// specifications so shared campaign links render rich previews on social
// platforms. Covers: og:image dimensions/alt, og:type, twitter:site,
// twitter:image:alt, and campaign-specific overrides.

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import PageMeta from './PageMeta';

// react-helmet-async commits its <head> tags via requestAnimationFrame rather
// than synchronously during render, so tests must wait a frame before
// inspecting document.head — otherwise every assertion below sees stale
// (pre-mount) tags.
async function renderMeta(props = {}) {
  render(
    <HelmetProvider>
      <PageMeta {...props} />
    </HelmetProvider>,
  );
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function getMeta(selector) {
  return document.querySelector(selector);
}

describe('PageMeta — Open Graph tags (#948)', () => {
  it('sets og:title and og:description', async () => {
    await renderMeta({ title: 'Alpha Drop | Trivela', description: 'Earn XLM rewards.' });
    expect(getMeta('meta[property="og:title"]')?.content).toBe('Alpha Drop | Trivela');
    expect(getMeta('meta[property="og:description"]')?.content).toBe('Earn XLM rewards.');
  });

  it('sets og:image with absolute URL', async () => {
    await renderMeta({ image: '/og-default.png' });
    const ogImage = getMeta('meta[property="og:image"]')?.content ?? '';
    expect(ogImage).toMatch(/^https?:\/\//);
  });

  it('sets og:image:width to 1200', async () => {
    await renderMeta();
    expect(getMeta('meta[property="og:image:width"]')?.content).toBe('1200');
  });

  it('sets og:image:height to 630', async () => {
    await renderMeta();
    expect(getMeta('meta[property="og:image:height"]')?.content).toBe('630');
  });

  it('sets og:image:alt from imageAlt prop', async () => {
    await renderMeta({ imageAlt: 'Alpha Drop campaign share card' });
    expect(getMeta('meta[property="og:image:alt"]')?.content).toBe(
      'Alpha Drop campaign share card',
    );
  });

  it('sets og:type', async () => {
    await renderMeta({ type: 'article' });
    expect(getMeta('meta[property="og:type"]')?.content).toBe('article');
  });

  it('defaults og:type to website', async () => {
    await renderMeta();
    expect(getMeta('meta[property="og:type"]')?.content).toBe('website');
  });
});

describe('PageMeta — Twitter Card tags (#948)', () => {
  it('sets twitter:card to summary_large_image', async () => {
    await renderMeta();
    expect(getMeta('meta[name="twitter:card"]')?.content).toBe('summary_large_image');
  });

  it('sets twitter:site to @TrivelaApp', async () => {
    await renderMeta();
    expect(getMeta('meta[name="twitter:site"]')?.content).toBe('@TrivelaApp');
  });

  it('sets twitter:image:alt from imageAlt prop', async () => {
    await renderMeta({ imageAlt: 'Beta campaign card' });
    expect(getMeta('meta[name="twitter:image:alt"]')?.content).toBe('Beta campaign card');
  });

  it('sets twitter:title and twitter:description', async () => {
    await renderMeta({ title: 'Beta Drop | Trivela', description: 'Win NFTs.' });
    expect(getMeta('meta[name="twitter:title"]')?.content).toBe('Beta Drop | Trivela');
    expect(getMeta('meta[name="twitter:description"]')?.content).toBe('Win NFTs.');
  });
});
