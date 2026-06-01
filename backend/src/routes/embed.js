/**
 * Embed widget route — /embed/campaign/:id
 *
 * Returns a minimal, iframe-safe HTML page showing a campaign card with
 * a "Register on Trivela" CTA that opens the main site in a new tab.
 * No navigation header, no footer, no external script dependencies.
 */

const MAX_DESC_LEN = 160;

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

export function createEmbedRoute(campaignRepository, siteOrigin) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  return function embedCampaignCard(req, res) {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) {
      res.status(404).send('<html><body style="font-family:sans-serif;padding:16px;color:#ef4444">Campaign not found.</body></html>');
      return;
    }

    const status = statusLabel(campaign);
    const spots = remainingSpots(campaign);
    const participantCount = campaign.participantCount ?? campaign.registrations ?? 0;
    const desc = truncate(campaign.description, MAX_DESC_LEN);
    const registerUrl = `${siteOrigin}/campaign/${campaign.id}`;
    const isActive = status === 'Active';

    const statusColor = isActive ? '#22c55e' : '#94a3b8';
    const btnBg = isActive ? '#3b82f6' : '#64748b';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Embed-Route', 'true');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${campaign.name} — Trivela</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px 24px;
      width: 100%;
      max-width: 420px;
    }
    .eyebrow {
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
    }
    .name {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .desc {
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 18px;
    }
    .meta-item { font-size: 0.78rem; color: #64748b; }
    .meta-item strong { color: #cbd5e1; }
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
    }
    .btn:hover { opacity: 0.88; }
    .btn:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
    .powered {
      text-align: center;
      margin-top: 12px;
      font-size: 0.68rem;
      color: #475569;
    }
    .powered a { color: #64748b; text-decoration: none; }
    .powered a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <p class="eyebrow">Trivela Campaign</p>
    <h1 class="name">${campaign.name}</h1>
    ${desc ? `<p class="desc">${desc}</p>` : ''}
    <div class="meta">
      <span class="meta-item"><span class="status-dot"></span><strong>${status}</strong></span>
      <span class="meta-item">Participants: <strong>${participantCount}</strong></span>
      ${spots !== null ? `<span class="meta-item">Spots left: <strong>${spots}</strong></span>` : ''}
      ${campaign.rewardPerAction ? `<span class="meta-item">Reward: <strong>${campaign.rewardPerAction} pts</strong></span>` : ''}
    </div>
    <a href="${registerUrl}" target="_blank" rel="noopener noreferrer" class="btn">
      Register on Trivela ↗
    </a>
    <p class="powered">Powered by <a href="${siteOrigin}" target="_blank" rel="noopener noreferrer">Trivela</a></p>
  </div>
</body>
</html>`);
  };
}