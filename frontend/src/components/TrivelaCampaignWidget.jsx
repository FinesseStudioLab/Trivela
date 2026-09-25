import {
  EMBED_SANDBOX,
  EMBED_WIDGET_SIZES,
  buildEmbedUrl,
  validateEmbedOptions,
} from '../lib/embedSnippet.js';

/**
 * Drop-in React component for partner sites (#1219): renders a sandboxed
 * iframe of a Trivela campaign widget (card, leaderboard or progress) with
 * a "Register on Trivela" call to action.
 *
 * Invalid props render nothing visible to end users (and log once in
 * development) instead of throwing, so a misconfigured embed can never break
 * the host page.
 *
 * @param {{
 *   origin?: string,
 *   campaignId: string | number,
 *   widget?: 'card' | 'leaderboard' | 'progress',
 *   theme?: 'dark' | 'light',
 *   color?: string,
 *   partner?: string,
 *   org?: string,
 *   limit?: number,
 *   width?: number | string,
 *   height?: number | string,
 *   title?: string,
 *   className?: string,
 *   style?: import('react').CSSProperties,
 * }} props
 */
export default function TrivelaCampaignWidget({
  origin = 'https://trivela.app',
  campaignId,
  widget = 'card',
  theme = 'dark',
  color,
  partner,
  org,
  limit,
  width,
  height,
  title,
  className,
  style,
}) {
  const options = { campaignId, widget, theme, color, partner, org, limit };
  const validation = validateEmbedOptions(options);
  if (!validation.ok) {
    if (import.meta.env?.DEV) {
      console.warn('[TrivelaCampaignWidget] invalid props:', validation.errors.join('; '));
    }
    return null;
  }

  const size = EMBED_WIDGET_SIZES[widget];
  return (
    <iframe
      src={buildEmbedUrl(origin, options)}
      width={width ?? size.width}
      height={height ?? size.height}
      title={title ?? 'Trivela campaign'}
      sandbox={EMBED_SANDBOX}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      className={className}
      style={{ border: 'none', borderRadius: 12, maxWidth: '100%', ...style }}
    />
  );
}
