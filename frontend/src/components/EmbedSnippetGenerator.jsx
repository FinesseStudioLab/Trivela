import { useMemo, useState } from 'react';
import {
  EMBED_THEMES,
  EMBED_WIDGET_TYPES,
  buildIframeSnippet,
  buildReactSnippet,
} from '../lib/embedSnippet.js';

/**
 * "Embed this campaign" panel (#1219): lets partners pick a widget and theme
 * and copy either an <iframe> or a <TrivelaCampaignWidget> React snippet.
 *
 * @param {{ campaignId: string | number, campaignName?: string, origin?: string }} props
 */
export default function EmbedSnippetGenerator({ campaignId, campaignName, origin }) {
  const siteOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const [widget, setWidget] = useState('card');
  const [theme, setTheme] = useState('dark');
  const [format, setFormat] = useState('iframe');
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(() => {
    const options = { campaignId, widget, theme, title: campaignName };
    return format === 'react'
      ? buildReactSnippet(siteOrigin, options)
      : buildIframeSnippet(siteOrigin, options);
  }, [campaignId, campaignName, widget, theme, format, siteOrigin]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const selectStyle = { fontSize: '0.8rem', padding: '4px 6px' };

  return (
    <div className="embed-snippet-generator">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '0 0 12px' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Widget{' '}
          <select value={widget} onChange={(e) => setWidget(e.target.value)} style={selectStyle}>
            {EMBED_WIDGET_TYPES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Theme{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value)} style={selectStyle}>
            {EMBED_THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Format{' '}
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={selectStyle}>
            <option value="iframe">HTML iframe</option>
            <option value="react">React component</option>
          </select>
        </label>
      </div>
      <pre
        style={{
          background: 'var(--color-bg, #0f172a)',
          padding: '12px',
          borderRadius: '6px',
          fontSize: '0.75rem',
          overflowX: 'auto',
          margin: '0 0 12px',
        }}
      >
        <code data-testid="embed-snippet">{snippet}</code>
      </pre>
      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={copy}>
        {copied ? 'Copied!' : 'Copy snippet'}
      </button>
    </div>
  );
}
