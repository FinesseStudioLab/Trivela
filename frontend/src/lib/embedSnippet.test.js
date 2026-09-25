import { describe, it, expect } from 'vitest';
import {
  EMBED_SANDBOX,
  buildEmbedUrl,
  buildIframeSnippet,
  buildReactSnippet,
  validateEmbedOptions,
} from './embedSnippet.js';

const ORIGIN = 'https://trivela.app';

describe('validateEmbedOptions (#1219)', () => {
  it('defaults to a dark card', () => {
    expect(validateEmbedOptions({ campaignId: 7 })).toEqual({
      ok: true,
      value: { campaignId: '7', widget: 'card', theme: 'dark' },
    });
  });

  it('rejects values the backend would reject', () => {
    const result = validateEmbedOptions({
      campaignId: '',
      widget: 'banner',
      theme: 'neon',
      color: 'red',
      partner: 'bad partner!',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(5);
  });

  it('bounds the leaderboard limit and ignores it for other widgets', () => {
    expect(validateEmbedOptions({ campaignId: 1, widget: 'leaderboard', limit: 51 }).ok).toBe(false);
    expect(validateEmbedOptions({ campaignId: 1, widget: 'leaderboard', limit: 0 }).ok).toBe(false);
    expect(validateEmbedOptions({ campaignId: 1, widget: 'leaderboard', limit: 20 }).value.limit).toBe(20);
    expect(validateEmbedOptions({ campaignId: 1, widget: 'card', limit: 999 }).value).not.toHaveProperty('limit');
  });
});

describe('buildEmbedUrl', () => {
  it('targets the versioned widget route with encoded params', () => {
    const url = new URL(
      buildEmbedUrl(ORIGIN, {
        campaignId: 42,
        widget: 'leaderboard',
        theme: 'light',
        color: '#6366f1',
        partner: 'acme_1',
        org: 'Acme & Co',
        limit: 5,
      }),
    );
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe('/embed/v1/leaderboard/42');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      theme: 'light',
      color: '#6366f1',
      partner: 'acme_1',
      org: 'Acme & Co',
      limit: '5',
    });
  });

  it('throws on invalid options', () => {
    expect(() => buildEmbedUrl(ORIGIN, { campaignId: 1, widget: 'nope' })).toThrow(/widget must be/);
  });
});

describe('buildIframeSnippet', () => {
  it('produces a sandboxed, lazy, sized iframe with escaped attributes', () => {
    const snippet = buildIframeSnippet(ORIGIN, {
      campaignId: 42,
      widget: 'progress',
      title: 'Hack "the" <planet>',
    });
    expect(snippet).toContain('src="https://trivela.app/embed/v1/progress/42?theme=dark"');
    expect(snippet).toContain('width="400"');
    expect(snippet).toContain('height="200"');
    expect(snippet).toContain(`sandbox="${EMBED_SANDBOX}"`);
    expect(snippet).toContain('loading="lazy"');
    expect(snippet).toContain('title="Hack &quot;the&quot; &lt;planet&gt; on Trivela"');
    expect(EMBED_SANDBOX).not.toContain('allow-same-origin');
  });
});

describe('buildReactSnippet', () => {
  it('lists only the props that are set', () => {
    const snippet = buildReactSnippet(ORIGIN, { campaignId: 42, widget: 'card', partner: 'acme' });
    expect(snippet).toContain("import TrivelaCampaignWidget from './TrivelaCampaignWidget';");
    expect(snippet).toContain('  campaignId="42"');
    expect(snippet).toContain('  partner="acme"');
    expect(snippet).not.toContain('color=');
    expect(snippet.trim().endsWith('/>')).toBe(true);
  });
});
