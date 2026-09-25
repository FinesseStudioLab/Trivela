/**
 * Embed snippet builders for partner websites (#1219).
 *
 * Partners can embed a live campaign widget either as a plain `<iframe>` or
 * with the `<TrivelaCampaignWidget>` React component. Both point at the
 * backend's versioned, sandbox-safe widget route:
 *
 *   /embed/v1/:widgetType/:campaignId?theme=&color=&partner=&org=&limit=
 *
 * Options are validated with the same rules the backend enforces
 * (backend/src/routes/embedWidget.js), so a generated snippet never embeds a
 * URL the server would reject or sanitise away.
 */

export const EMBED_WIDGET_TYPES = Object.freeze(['card', 'leaderboard', 'progress']);
export const EMBED_THEMES = Object.freeze(['dark', 'light']);

/** Default iframe size per widget, matching each widget's natural layout. */
export const EMBED_WIDGET_SIZES = Object.freeze({
  card: { width: 400, height: 280 },
  leaderboard: { width: 400, height: 480 },
  progress: { width: 400, height: 200 },
});

/**
 * The widget pages run a small inline script (resize/postMessage) and open
 * "Register on Trivela" in a new tab; nothing else is granted — in
 * particular not `allow-same-origin`, so the widget can't touch the host
 * page.
 */
export const EMBED_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

export const MAX_LEADERBOARD_ROWS = 50;
const PARTNER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ORG_LENGTH = 60;

/**
 * Validate and normalise embed options.
 *
 * @param {{
 *   campaignId: string | number,
 *   widget?: string,
 *   theme?: string,
 *   color?: string,
 *   partner?: string,
 *   org?: string,
 *   limit?: number | string,
 * }} options
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validateEmbedOptions(options = {}) {
  const errors = [];
  const campaignId = String(options.campaignId ?? '').trim();
  const widget = options.widget ?? 'card';
  const theme = options.theme ?? 'dark';

  if (!CAMPAIGN_ID_PATTERN.test(campaignId)) errors.push('campaignId is required');
  if (!EMBED_WIDGET_TYPES.includes(widget)) {
    errors.push(`widget must be one of: ${EMBED_WIDGET_TYPES.join(', ')}`);
  }
  if (!EMBED_THEMES.includes(theme)) errors.push(`theme must be one of: ${EMBED_THEMES.join(', ')}`);
  if (options.color && !COLOR_PATTERN.test(options.color)) {
    errors.push('color must be a hex colour like #6366f1');
  }
  if (options.partner && !PARTNER_PATTERN.test(options.partner)) {
    errors.push('partner may only contain letters, digits, "-" and "_" (max 64)');
  }
  const org = options.org ? String(options.org).trim().slice(0, MAX_ORG_LENGTH) : undefined;

  let limit;
  if (options.limit !== undefined && options.limit !== '' && widget === 'leaderboard') {
    limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LEADERBOARD_ROWS) {
      errors.push(`limit must be an integer from 1 to ${MAX_LEADERBOARD_ROWS}`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      campaignId,
      widget,
      theme,
      ...(options.color ? { color: options.color } : {}),
      ...(options.partner ? { partner: options.partner } : {}),
      ...(org ? { org } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
  };
}

/**
 * Build the widget URL on `origin`. Throws on invalid options.
 * @param {string} origin e.g. https://trivela.app
 * @param {Parameters<typeof validateEmbedOptions>[0]} options
 */
export function buildEmbedUrl(origin, options) {
  const result = validateEmbedOptions(options);
  if (!result.ok) throw new Error(`Invalid embed options: ${result.errors.join('; ')}`);
  const { campaignId, widget, theme, color, partner, org, limit } = result.value;

  const url = new URL(`/embed/v1/${widget}/${encodeURIComponent(campaignId)}`, origin);
  url.searchParams.set('theme', theme);
  if (color) url.searchParams.set('color', color);
  if (partner) url.searchParams.set('partner', partner);
  if (org) url.searchParams.set('org', org);
  if (limit !== undefined) url.searchParams.set('limit', String(limit));
  return url.toString();
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Copy-paste `<iframe>` snippet for any website.
 * @param {string} origin
 * @param {Parameters<typeof validateEmbedOptions>[0] & { title?: string }} options
 */
export function buildIframeSnippet(origin, options) {
  const src = buildEmbedUrl(origin, options);
  const { width, height } = EMBED_WIDGET_SIZES[options.widget ?? 'card'];
  const title = options.title ? `${options.title} on Trivela` : 'Trivela campaign';
  return [
    '<iframe',
    `  src="${escapeAttr(src)}"`,
    `  width="${width}"`,
    `  height="${height}"`,
    `  title="${escapeAttr(title)}"`,
    `  sandbox="${EMBED_SANDBOX}"`,
    '  loading="lazy"',
    '  referrerpolicy="strict-origin-when-cross-origin"',
    '  style="border:none;border-radius:12px;max-width:100%;"',
    '></iframe>',
  ].join('\n');
}

/**
 * Copy-paste React snippet using <TrivelaCampaignWidget>.
 * @param {string} origin
 * @param {Parameters<typeof validateEmbedOptions>[0]} options
 */
export function buildReactSnippet(origin, options) {
  const result = validateEmbedOptions(options);
  if (!result.ok) throw new Error(`Invalid embed options: ${result.errors.join('; ')}`);
  const v = result.value;
  const props = [
    `origin="${origin}"`,
    `campaignId="${v.campaignId}"`,
    `widget="${v.widget}"`,
    `theme="${v.theme}"`,
    v.color && `color="${v.color}"`,
    v.partner && `partner="${v.partner}"`,
    v.org && `org=${JSON.stringify(v.org)}`,
    v.limit !== undefined && `limit={${v.limit}}`,
  ].filter(Boolean);
  return [
    "import TrivelaCampaignWidget from './TrivelaCampaignWidget';",
    '',
    '<TrivelaCampaignWidget',
    ...props.map((p) => `  ${p}`),
    '/>',
  ].join('\n');
}
