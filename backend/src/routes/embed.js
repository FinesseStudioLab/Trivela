/**
 * Embed widget route — /embed/campaign/:id
 *
 * Returns a minimal, iframe-safe HTML page showing a campaign card with
 * a "Register on Trivela" CTA that opens the main site in a new tab.
 * No navigation header, no footer, no external script dependencies.
 *
 * Query parameters:
 *   ?partner=<id>   Partner/referrer ID (alphanumeric + _-, max 64 chars).
 *                   Carried through to the registration URL for on-chain
 *                   referral attribution. Combined with a short-lived HMAC
 *                   attribution token to prevent spoofing.
 *   ?org=<name>     Org/partner display name for "Powered by" branding.
 *   ?color=<hex>    CSS hex colour (#RRGGBB) overriding the default CTA button.
 *   ?theme=light    Light theme (default: dark).
 */

import { createHmac } from 'node:crypto';

const MAX_DESC_LEN = 160;

// Allowed partner ID chars: letters, digits, hyphen, underscore — max 64.
const PARTNER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Strict hex colour: #RGB or #RRGGBB
const COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/**
 * Sanitise a single-line user-supplied string for safe HTML interpolation.
 * @param {string | null | undefined} raw
 * @param {number} maxLen
 * @returns {string}
 */
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

function truncate(text, maxLen) {
  if (!text) return '';
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}

function statusLabel(campaign) {
  if (!campaign.active) return 'Ended';
  if (campaign.endDate && new Date(campaign.endDate) < new Date()) return 'Ended';
  return 'Active';
}

function remainingSpots(campaign) {
  const max = campaign.maxParticipants ?? null;
  const current = campaign.participantCount ?? campaign.registrations ?? 0;
  if (max == null) return null;
  return Math.max(0, max - current);
}

/**
 * Generate a short-lived HMAC attribution token for the given partner + campaign.
 * Token is bound to a 5-minute time bucket so replays beyond that window fail.
 *
 * @param {string} campaignId
 * @param {string} partnerId
 * @param {string} secret  EMBED_ATTRIBUTION_SECRET env value
 * @returns {string}  hex-encoded first 16 bytes of HMAC-SHA256
 */
function signAttributionToken(campaignId, partnerId, secret) {
  const bucket = Math.floor(Date.now() / 300_000); // 5-min rolling window
  const payload = `${campaignId}:${partnerId}:${bucket}`;
  return createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
}

/**
 * Verify an attribution token.  Accepts current bucket and the immediately
 * preceding bucket to tolerate clock skew at window boundaries.
 *
 * @param {string} campaignId
 * @param {string} partnerId
 * @param {string} token
 * @param {string} secret
 * @returns {boolean}
 */
export function verifyAttributionToken(campaignId, partnerId, token, secret) {
  if (!token || !secret) return false;
  const now = Math.floor(Date.now() / 300_000);
  for (const bucket of [now, now - 1]) {
    const payload = `${campaignId}:${partnerId}:${bucket}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
    if (expected === token) return true;
  }
  return false;
}

export function createEmbedRoute(campaignRepository, siteOrigin, { embedSecret = '' } = {}) {
  const secret = embedSecret || process.env.EMBED_ATTRIBUTION_SECRET || 'trivela-embed-dev-secret';

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  return function embedCampaignCard(req, res) {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) {
      res
        .status(404)
        .send(
          '<html><body style="font-family:sans-serif;padding:16px;color:#ef4444">Campaign not found.</body></html>',
        );
      return;
    }

    // ── Query param validation ────────────────────────────────────────────────
    const rawPartner = typeof req.query.partner === 'string' ? req.query.partner.trim() : '';
    const partner = PARTNER_PATTERN.test(rawPartner) ? rawPartner : '';

    const rawColor = typeof req.query.color === 'string' ? req.query.color.trim() : '';
    const customColor = COLOR_PATTERN.test(rawColor) ? rawColor : '';

    const isDark = req.query.theme !== 'light';

    // Sanitise org name for safe HTML interpolation.
    const orgName = sanitiseText(req.query.org, 48);

    // ── Attribution token ─────────────────────────────────────────────────────
    const atToken = partner ? signAttributionToken(String(campaign.id), partner, secret) : '';

    // ── Build registration URL ────────────────────────────────────────────────
    const registerUrl = new URL(`${siteOrigin}/campaign/${campaign.id}`);
    if (partner) {
      registerUrl.searchParams.set('ref', partner);
      registerUrl.searchParams.set('at', atToken);
    }

    // ── Derived campaign values ───────────────────────────────────────────────
    const status = statusLabel(campaign);
    const spots = remainingSpots(campaign);
    const participantCount = campaign.participantCount ?? campaign.registrations ?? 0;
    const desc = sanitiseText(truncate(campaign.description, MAX_DESC_LEN), MAX_DESC_LEN + 10);
    const name = sanitiseText(campaign.name, 120);
    const isActive = status === 'Active';

    const statusColor = isActive ? '#22c55e' : '#94a3b8';
    const defaultBtn = isActive ? '#3b82f6' : '#64748b';
    const btnBg = customColor || defaultBtn;

    // ── Theme colours ─────────────────────────────────────────────────────────
    const bg = isDark ? '#0f172a' : '#f8fafc';
    const cardBg = isDark ? '#1e293b' : '#ffffff';
    const cardBorder = isDark ? '#334155' : '#e2e8f0';
    const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const textMeta = isDark ? '#64748b' : '#94a3b8';
    const poweredColor = isDark ? '#475569' : '#94a3b8';
    const poweredLink = isDark ? '#64748b' : '#475569';
    const eyebrowColor = isDark ? '#64748b' : '#94a3b8';

    // Campaign ID for postMessage event payloads (safe string).
    const safeCampaignId = sanitiseText(String(campaign.id), 64);
    const safePartner = sanitiseText(partner, 64);
    const poweredLabel = orgName ? `Powered by ${orgName} via Trivela` : 'Powered by Trivela';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Embed-Route', 'true');
    // Prevent the embed from navigating the top-level frame (belt-and-suspenders
    // alongside the `sandbox` attribute set by the partner SDK).
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — Trivela</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: ${bg};
      color: ${textPrimary};
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: ${cardBg};
      border: 1px solid ${cardBorder};
      border-radius: 12px;
      padding: 20px 24px;
      width: 100%;
      max-width: 420px;
    }
    .eyebrow {
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${eyebrowColor};
      margin-bottom: 6px;
    }
    .name {
      font-size: 1.1rem;
      font-weight: 700;
      color: ${textPrimary};
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .desc {
      font-size: 0.85rem;
      color: ${textMuted};
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 18px;
    }
    .meta-item { font-size: 0.78rem; color: ${textMeta}; }
    .meta-item strong { color: ${textPrimary}; }
    .status-dot {
      display: inline-block;
      width: 7px; height: 7px;
      border-radius: 50%;
      background: ${statusColor};
      margin-right: 5px;
      vertical-align: middle;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 10px 0;
      background: ${btnBg};
      color: #fff;
      font-weight: 600;
      font-size: 0.9rem;
      text-align: center;
      text-decoration: none;
      border-radius: 8px;
      transition: opacity 0.15s;
      cursor: pointer;
    }
    .btn:hover { opacity: 0.88; }
    .btn:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
    .powered {
      text-align: center;
      margin-top: 12px;
      font-size: 0.68rem;
      color: ${poweredColor};
    }
    .powered a { color: ${poweredLink}; text-decoration: none; }
    .powered a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <p class="eyebrow">Trivela Campaign</p>
    <h1 class="name">${name}</h1>
    ${desc ? `<p class="desc">${desc}</p>` : ''}
    <div class="meta">
      <span class="meta-item"><span class="status-dot"></span><strong>${status}</strong></span>
      <span class="meta-item">Participants: <strong>${participantCount}</strong></span>
      ${spots !== null ? `<span class="meta-item">Spots left: <strong>${spots}</strong></span>` : ''}
      ${campaign.rewardPerAction ? `<span class="meta-item">Reward: <strong>${campaign.rewardPerAction} pts</strong></span>` : ''}
    </div>
    <a
      href="${registerUrl.toString()}"
      target="_blank"
      rel="noopener noreferrer"
      class="btn"
      data-trivela-register="true"
    >
      Register on Trivela ↗
    </a>
    <p class="powered">
      ${poweredLabel.replace('Trivela', `<a href="${siteOrigin}" target="_blank" rel="noopener noreferrer">Trivela</a>`)}
    </p>
  </div>
  <script>
    (function () {
      var campaignId = ${JSON.stringify(safeCampaignId)};
      var partner = ${JSON.stringify(safePartner)};
      var origin = ${JSON.stringify(siteOrigin || '*')};

      function post(type, payload) {
        try {
          var msg = { source: 'trivela-widget', type: type, payload: payload };
          window.parent.postMessage(msg, origin || '*');
        } catch (_) {}
      }

      // Signal that the widget has loaded successfully.
      post('trivela:ready', { campaignId: campaignId, partner: partner });

      // Fire trivela:register_click when the CTA is activated.
      var btn = document.querySelector('[data-trivela-register]');
      if (btn) {
        btn.addEventListener('click', function () {
          post('trivela:register_click', { campaignId: campaignId, partner: partner });
        });
      }
    })();
  </script>
</body>
</html>`);
  };
}
