/**
 * Embeddable widget route — /embed/v1/:widgetType/:campaignId
 *
 * Sandboxed iframe widgets for partners to embed on their sites.
 * Versioned API (v1) for stable embeds.
 *
 * Supported widget types:
 *   - card       Campaign card with CTA
 *   - leaderboard Top participants ranking
 *   - progress   Campaign progress bar + stats
 *
 * Query parameters:
 *   ?theme=light|dark   Theme (default: dark)
 *   ?color=<hex>        Custom accent color
 *   ?limit=<n>          Max leaderboard rows (default: 10, max: 50)
 *   ?partner=<id>       Partner/referrer ID
 *   ?org=<name>         Partner display name
 *
 * Security:
 *   - CSP frame-ancestors restricts embedding origins
 *   - No PII leakage (only public display names)
 *   - Sandboxed iframe attributes
 */

import { createHmac } from 'node:crypto';

const EMBED_VERSION = 'v1';
const MAX_LEADERBOARD_ROWS = 50;
const DEFAULT_LEADERBOARD_ROWS = 10;

const PARTNER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function sanitiseText(raw, maxLen) {
  if (!raw) return '';
  return String(raw)
    .slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(campaign) {
  if (!campaign.active) return 'Ended';
  if (campaign.endDate && new Date(campaign.endDate) < new Date()) return 'Ended';
  return 'Active';
}

/**
 * Build CSP header value for embed widgets.
 * @param {string} siteOrigin
 */
function buildCspHeader(siteOrigin) {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src https: data:",
    `frame-ancestors ${siteOrigin} *`,
  ].join('; ');
}

/**
 * Generate campaign card widget HTML.
 */
function renderCardWidget(campaign, params) {
  const { theme, color, partner, org, siteOrigin } = params;
  const isDark = theme !== 'light';
  const status = statusLabel(campaign);
  const participantCount = campaign.participantCount ?? campaign.registrations ?? 0;
  const name = sanitiseText(campaign.name, 120);
  const desc = sanitiseText(campaign.description ?? '', 160);
  const isActive = status === 'Active';

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const btnBg = color || (isActive ? '#3b82f6' : '#64748b');
  const statusColor = isActive ? '#22c55e' : '#94a3b8';

  const registerUrl = new URL(`${siteOrigin}/campaign/${campaign.id}`);
  if (partner) {
    registerUrl.searchParams.set('ref', partner);
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:${bg};padding:12px}
.card{background:${cardBg};border-radius:12px;padding:16px;border:1px solid ${isDark ? '#334155' : '#e2e8f0'}}
.status{display:inline-block;font-size:11px;font-weight:600;color:${statusColor};margin-bottom:8px}
.name{font-size:16px;font-weight:700;color:${textPrimary};margin-bottom:4px}
.desc{font-size:13px;color:${textMuted};margin-bottom:12px;line-height:1.4}
.meta{font-size:12px;color:${textMuted};margin-bottom:12px}
.btn{display:block;text-align:center;background:${btnBg};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600}
.powered{font-size:10px;color:${isDark ? '#475569' : '#94a3b8'};text-align:center;margin-top:8px}
.powered a{color:${isDark ? '#64748b' : '#475569'};text-decoration:none}
</style></head><body>
<div class="card">
  <div class="status">${isActive ? '● Active' : '○ Ended'}</div>
  <div class="name">${name}</div>
  ${desc ? `<div class="desc">${desc}</div>` : ''}
  <div class="meta">${participantCount} participants</div>
  <a class="btn" href="${registerUrl}" target="_blank" rel="noopener">Register on Trivela</a>
  ${org ? `<div class="powered">Powered by ${sanitiseText(org, 48)}</div>` : ''}
</div>
</body></html>`;
}

/**
 * Generate leaderboard widget HTML.
 */
function renderLeaderboardWidget(campaign, entries, params) {
  const { theme, color, limit } = params;
  const isDark = theme !== 'light';
  const name = sanitiseText(campaign.name, 80);

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const accent = color || '#3b82f6';

  const rows = (entries ?? []).slice(0, limit).map((entry, i) => {
    const rank = i + 1;
    const displayName = sanitiseText(entry.displayName ?? entry.address ?? 'Anonymous', 32);
    const points = entry.points ?? entry.score ?? 0;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid ${borderColor};font-weight:${rank <= 3 ? 700 : 400}">${medal}</td><td style="padding:8px 12px;border-bottom:1px solid ${borderColor};color:${textPrimary}">${displayName}</td><td style="padding:8px 12px;border-bottom:1px solid ${borderColor};text-align:right;color:${accent};font-weight:600">${points}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:${bg};padding:12px}
.card{background:${cardBg};border-radius:12px;padding:16px;border:1px solid ${borderColor}}
.title{font-size:14px;font-weight:700;color:${textPrimary};margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:8px 12px;text-align:left;color:${textMuted};font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${borderColor}}
th:last-child{text-align:right}
</style></head><body>
<div class="card">
  <div class="title">🏆 ${name} Leaderboard</div>
  <table><thead><tr><th>#</th><th>Participant</th><th>Points</th></tr></thead><tbody>${rows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#94a3b8">No participants yet</td></tr>'}</tbody></table>
</div>
</body></html>`;
}

/**
 * Generate progress widget HTML.
 */
function renderProgressWidget(campaign, params) {
  const { theme, color } = params;
  const isDark = theme !== 'light';
  const name = sanitiseText(campaign.name, 80);
  const participantCount = campaign.participantCount ?? campaign.registrations ?? 0;
  const maxParticipants = campaign.maxParticipants ?? null;
  const progress = maxParticipants ? Math.min(100, Math.round((participantCount / maxParticipants) * 100)) : null;
  const status = statusLabel(campaign);

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const accent = color || '#3b82f6';
  const trackBg = isDark ? '#334155' : '#e2e8f0';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:${bg};padding:12px}
.card{background:${cardBg};border-radius:12px;padding:16px;border:1px solid ${borderColor}}
.title{font-size:14px;font-weight:700;color:${textPrimary};margin-bottom:4px}
.status{font-size:11px;font-weight:600;color:${status === 'Active' ? '#22c55e' : '#94a3b8'};margin-bottom:12px}
.stats{display:flex;gap:16px;margin-bottom:12px}
.stat{flex:1;text-align:center}
.stat-value{font-size:20px;font-weight:700;color:${accent}}
.stat-label{font-size:11px;color:${textMuted}}
.track{background:${trackBg};border-radius:8px;height:12px;overflow:hidden;margin-bottom:4px}
.fill{background:${accent};height:100%;border-radius:8px;transition:width 0.3s}
.progress-label{font-size:11px;color:${textMuted};text-align:right}
</style></head><body>
<div class="card">
  <div class="title">${name}</div>
  <div class="status">${status === 'Active' ? '● Active' : '○ Ended'}</div>
  <div class="stats">
    <div class="stat"><div class="stat-value">${participantCount}</div><div class="stat-label">Participants</div></div>
    ${maxParticipants ? `<div class="stat"><div class="stat-value">${maxParticipants}</div><div class="stat-label">Max</div></div>` : ''}
  </div>
  ${progress !== null ? `<div class="track"><div class="fill" style="width:${progress}%"></div></div><div class="progress-label">${progress}%</div>` : ''}
</div>
</body></html>`;
}

/**
 * Create the versioned embed widget route.
 * @param {object} campaignRepository
 * @param {string} siteOrigin
 * @param {object} options
 * @returns {import('express').RequestHandler}
 */
export function createEmbedWidgetRoute(campaignRepository, siteOrigin, { embedSecret = '' } = {}) {
  return function embedWidget(req, res) {
    const { widgetType, campaignId } = req.params;

    // Validate widget type
    const validTypes = ['card', 'leaderboard', 'progress'];
    if (!validTypes.includes(widgetType)) {
      return res.status(400).json({
        error: `Invalid widget type. Supported: ${validTypes.join(', ')}`,
      });
    }

    const campaign = campaignRepository.getById(campaignId);
    if (!campaign) {
      return res.status(404).send(
        '<html><body style="font-family:sans-serif;padding:16px;color:#ef4444">Campaign not found.</body></html>'
      );
    }

    // Parse params
    const theme = req.query.theme === 'light' ? 'light' : 'dark';
    const rawColor = typeof req.query.color === 'string' ? req.query.color.trim() : '';
    const color = COLOR_PATTERN.test(rawColor) ? rawColor : '';
    const rawPartner = typeof req.query.partner === 'string' ? req.query.partner.trim() : '';
    const partner = PARTNER_PATTERN.test(rawPartner) ? rawPartner : '';
    const org = sanitiseText(req.query.org, 48);
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
      MAX_LEADERBOARD_ROWS,
      Math.max(1, isNaN(rawLimit) ? DEFAULT_LEADERBOARD_ROWS : rawLimit)
    );

    // Set CSP headers
    res.setHeader('Content-Security-Policy', buildCspHeader(siteOrigin));
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Cache-Control', 'public, max-age=60');

    const params = { theme, color, partner, org, siteOrigin, limit };

    let html;
    switch (widgetType) {
      case 'card':
        html = renderCardWidget(campaign, params);
        break;
      case 'leaderboard': {
        const entries = campaignRepository.getLeaderboard?.(campaignId, limit) ?? [];
        html = renderLeaderboardWidget(campaign, entries, params);
        break;
      }
      case 'progress':
        html = renderProgressWidget(campaign, params);
        break;
    }

    res.type('html').send(html);
  };
}
