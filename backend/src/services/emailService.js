// Transactional email service — issue #1025
// Provider-agnostic abstraction with versioned templates, retry, and bounce tracking.
// Configure the active provider via EMAIL_PROVIDER env var (resend | sendgrid | smtp).
// Set EMAIL_FROM and the provider API key (RESEND_API_KEY / SENDGRID_API_KEY).

import { logger } from '../lib/logger.js';

// ── Template registry ─────────────────────────────────────────────────────────

const TEMPLATES = {
  // v1 templates — bump version suffix when layout changes so old renders stay auditable.
  'claim-rewards-v1': {
    subject: 'Your Trivela rewards are ready to claim',
    html: ({ name, points, claimUrl }) => `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Hi ${escHtml(name)},</h2>
        <p>You have <strong>${points} points</strong> available to claim on Trivela.</p>
        <p><a href="${escHtml(claimUrl)}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Claim now</a></p>
        <p style="color:#888;font-size:12px">If you did not expect this email, you can safely ignore it.</p>
      </div>`,
    text: ({ name, points, claimUrl }) =>
      `Hi ${name},\n\nYou have ${points} points to claim on Trivela.\n\nClaim: ${claimUrl}\n`,
  },

  'campaign-unlock-v1': {
    subject: 'A campaign you follow just unlocked',
    html: ({ name, campaignName, campaignUrl }) => `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Hi ${escHtml(name)},</h2>
        <p>The campaign <strong>${escHtml(campaignName)}</strong> is now open for registration.</p>
        <p><a href="${escHtml(campaignUrl)}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">View campaign</a></p>
      </div>`,
    text: ({ name, campaignName, campaignUrl }) =>
      `Hi ${name},\n\n${campaignName} is now open.\n\nView: ${campaignUrl}\n`,
  },

  'operator-digest-v1': {
    subject: 'Your weekly Trivela operator digest',
    html: ({ name, totalParticipants, totalClaims, topCampaign, periodLabel }) => `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Weekly digest — ${escHtml(periodLabel)}</h2>
        <p>Hi ${escHtml(name)},</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Participants</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${totalParticipants}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Claims</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${totalClaims}</strong></td></tr>
          <tr><td style="padding:8px">Top campaign</td><td style="padding:8px"><strong>${escHtml(topCampaign)}</strong></td></tr>
        </table>
      </div>`,
    text: ({ name, totalParticipants, totalClaims, topCampaign, periodLabel }) =>
      `Weekly digest — ${periodLabel}\n\nHi ${name},\nParticipants: ${totalParticipants}\nClaims: ${totalClaims}\nTop campaign: ${topCampaign}\n`,
  },
};

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Provider adapters ─────────────────────────────────────────────────────────

async function sendViaResend({ from, to, subject, html, text }) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json();
}

async function sendViaSendGrid({ from, to, subject, html, text }) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${body}`);
  }
}

const PROVIDERS = {
  resend: sendViaResend,
  sendgrid: sendViaSendGrid,
};

// ── Core send with retry ──────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

async function sendWithRetry(payload) {
  const providerName = (process.env.EMAIL_PROVIDER ?? 'resend').toLowerCase();
  const send = PROVIDERS[providerName];
  if (!send) {
    throw new Error(
      `Unknown EMAIL_PROVIDER "${providerName}". Supported: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await send(payload);
      logger.info({ event: 'email_sent', to: payload.to, subject: payload.subject, attempt });
      return result;
    } catch (err) {
      lastError = err;
      // Bounce / permanent rejection — do not retry 4xx
      if (err.message?.match(/error 4\d\d/)) {
        logger.warn({ event: 'email_bounce', to: payload.to, error: err.message });
        throw err;
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  logger.error({ event: 'email_failed', to: payload.to, error: lastError?.message });
  throw lastError;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a templated transactional email.
 *
 * @param {string} templateId  Key from TEMPLATES (e.g. "claim-rewards-v1")
 * @param {string} to          Recipient email address
 * @param {object} vars        Template variables
 */
export async function sendEmail(templateId, to, vars = {}) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(
      `Unknown email template "${templateId}". Available: ${Object.keys(TEMPLATES).join(', ')}`,
    );
  }

  const from = process.env.EMAIL_FROM ?? 'noreply@trivela.io';
  const subject = template.subject;
  const html = template.html(vars);
  const text = template.text(vars);

  return sendWithRetry({ from, to, subject, html, text });
}

export { TEMPLATES };
