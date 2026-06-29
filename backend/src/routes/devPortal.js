/**
 * Developer portal route — /dev-portal
 *
 * Serves:
 * - Interactive API reference (Swagger UI from OpenAPI spec)
 * - Quickstart guide with code samples
 * - Sandbox API key management
 * - Webhook tester/echo
 * - Event catalog
 */

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create the developer portal routes.
 * @param {object} options
 * @param {object} options.apiKeyRepository - API key storage
 * @param {string} options.openApiPath - Path to openapi.yaml
 * @returns {Router}
 */
export function createDevPortalRoutes({ apiKeyRepository, openApiPath }) {
  const router = Router();

  // Serve the developer portal HTML
  router.get('/', (_req, res) => {
    res.type('html').send(renderPortalPage());
  });

  // Serve OpenAPI spec for Swagger UI
  router.get('/openapi.json', (_req, res) => {
    try {
      const spec = readFileSync(openApiPath, 'utf8');
      res.type('yaml').send(spec);
    } catch {
      res.status(504).json({ error: 'OpenAPI spec not available' });
    }
  });

  // Sandbox API key management
  router.post('/sandbox-keys', (req, res) => {
    const { name, email } = req.body ?? {};
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const key = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const sandboxKey = {
      key,
      name: String(name).slice(0, 64),
      email: String(email).slice(0, 128),
      scope: 'testnet',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    };

    // In production, persist to DB
    res.status(201).json({ sandboxKey });
  });

  // Webhook echo/test endpoint
  router.post('/webhook-echo', (req, res) => {
    const received = {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'],
        'x-webhook-signature': req.headers['x-webhook-signature'],
        'x-webhook-timestamp': req.headers['x-webhook-timestamp'],
      },
      body: req.body,
      receivedAt: new Date().toISOString(),
    };

    res.json({
      message: 'Webhook received successfully',
      received,
    });
  });

  // Event catalog
  router.get('/events', (_req, res) => {
    res.json({ events: getEventCatalog() });
  });

  // Quickstart guide
  router.get('/quickstart', (_req, res) => {
    res.type('html').send(renderQuickstartPage());
  });

  return router;
}

function getEventCatalog() {
  return [
    {
      event: 'campaign.created',
      description: 'A new campaign was created',
      payload: '{ campaignId, name, operatorAddress, createdAt }',
    },
    {
      event: 'campaign.updated',
      description: 'Campaign metadata was updated',
      payload: '{ campaignId, changes, updatedAt }',
    },
    {
      event: 'campaign.published',
      description: 'Campaign was published and is now visible',
      payload: '{ campaignId, publishedAt }',
    },
    {
      event: 'participant.registered',
      description: 'A participant registered for a campaign',
      payload: '{ campaignId, participantAddress, registeredAt }',
    },
    {
      event: 'participant.claimed',
      description: 'A participant claimed rewards',
      payload: '{ campaignId, participantAddress, amount, claimedAt }',
    },
    {
      event: 'leaderboard.updated',
      description: 'Campaign leaderboard rankings changed',
      payload: '{ campaignId, topParticipants, updatedAt }',
    },
    {
      event: 'campaign.ended',
      description: 'Campaign reached its end date or max participants',
      payload: '{ campaignId, endedAt, totalParticipants }',
    },
  ];
}

function renderPortalPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trivela Developer Portal</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f1f5f9;line-height:1.6}
.container{max-width:960px;margin:0 auto;padding:32px 24px}
h1{font-size:32px;font-weight:800;margin-bottom:8px}
.subtitle{color:#94a3b8;font-size:16px;margin-bottom:32px}
.section{background:#1e293b;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #334155}
.section h2{font-size:20px;font-weight:700;margin-bottom:12px;color:#f1f5f9}
.section p{color:#94a3b8;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.card{background:#0f172a;border-radius:8px;padding:16px;border:1px solid #334155}
.card h3{font-size:16px;font-weight:600;margin-bottom:8px;color:#3b82f6}
.card p{font-size:14px;color:#94a3b8}
a{color:#3b82f6;text-decoration:none}
a:hover{text-decoration:underline}
.btn{display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;border:none;cursor:pointer}
.btn:hover{background:#2563eb;text-decoration:none}
code{background:#334155;padding:2px 6px;border-radius:4px;font-size:13px;font-family:monospace}
pre{background:#0f172a;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;margin-bottom:16px}
pre code{background:none;padding:0}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:13px;color:#94a3b8;margin-bottom:4px}
.form-group input{width:100%;padding:10px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:14px}
.result{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-top:16px;display:none}
.nav{display:flex;gap:24px;margin-bottom:32px;border-bottom:1px solid #334155;padding-bottom:16px}
.nav a{color:#94a3b8;font-size:14px;font-weight:500}
.nav a.active{color:#3b82f6;border-bottom:2px solid #3b82f6;padding-bottom:16px}
</style>
</head><body>
<div class="container">
  <h1>Trivela Developer Portal</h1>
  <p class="subtitle">Build on Trivela — campaigns, rewards, and leaderboards on Stellar.</p>

  <nav class="nav">
    <a href="#overview" class="active">Overview</a>
    <a href="/dev-portal/quickstart">Quickstart</a>
    <a href="/dev-portal/openapi.json" target="_blank">OpenAPI Spec</a>
    <a href="#sandbox">Sandbox Keys</a>
    <a href="#webhook-test">Webhook Tester</a>
    <a href="#events">Event Catalog</a>
  </nav>

  <section class="section" id="overview">
    <h2>API Reference</h2>
    <p>Explore the full Trivela API interactively.</p>
    <iframe src="/docs" style="width:100%;height:600px;border:1px solid #334155;border-radius:8px;background:#fff"></iframe>
  </section>

  <section class="section" id="sandbox">
    <h2>Sandbox API Keys</h2>
    <p>Get a testnet-scoped API key to start building.</p>
    <div class="form-group">
      <label>Application Name</label>
      <input type="text" id="sandbox-name" placeholder="My App">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="sandbox-email" placeholder="dev@example.com">
    </div>
    <button class="btn" onclick="requestSandboxKey()">Get Sandbox Key</button>
    <div class="result" id="sandbox-result"></div>
  </section>

  <section class="section" id="webhook-test">
    <h2>Webhook Tester</h2>
    <p>Test your webhook integration by sending a test payload.</p>
    <button class="btn" onclick="testWebhook()">Send Test Webhook</button>
    <div class="result" id="webhook-result"></div>
  </section>

  <section class="section" id="events">
    <h2>Event Catalog</h2>
    <div class="grid">
      <div class="card"><h3>campaign.created</h3><p>A new campaign was created</p></div>
      <div class="card"><h3>campaign.published</h3><p>Campaign is now visible</p></div>
      <div class="card"><h3>participant.registered</h3><p>User registered for campaign</p></div>
      <div class="card"><h3>participant.claimed</h3><p>User claimed rewards</p></div>
      <div class="card"><h3>leaderboard.updated</h3><p>Rankings changed</p></div>
      <div class="card"><h3>campaign.ended</h3><p>Campaign reached end</p></div>
    </div>
  </section>
</div>
<script>
async function requestSandboxKey() {
  const name = document.getElementById('sandbox-name').value;
  const email = document.getElementById('sandbox-email').value;
  const res = await fetch('/dev-portal/sandbox-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  const data = await res.json();
  const el = document.getElementById('sandbox-result');
  el.style.display = 'block';
  el.innerHTML = res.ok
    ? '<strong>Your sandbox key:</strong><br><code>' + data.sandboxKey.key + '</code><br><small>Expires: ' + data.sandboxKey.expiresAt + '</small>'
    : '<span style="color:#ef4444">' + data.error + '</span>';
}

async function testWebhook() {
  const res = await fetch('/dev-portal/webhook-echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': 'test-sig-123' },
    body: JSON.stringify({ event: 'test.ping', data: { hello: 'world' } }),
  });
  const data = await res.json();
  const el = document.getElementById('webhook-result');
  el.style.display = 'block';
  el.innerHTML = '<strong>Response:</strong><pre><code>' + JSON.stringify(data, null, 2) + '</code></pre>';
}
</script>
</body></html>`;
}

function renderQuickstartPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quickstart — Trivela Developer Portal</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f1f5f9;line-height:1.6}
.container{max-width:720px;margin:0 auto;padding:32px 24px}
h1{font-size:28px;font-weight:800;margin-bottom:24px}
h2{font-size:20px;font-weight:700;margin:32px 0 12px;color:#f1f5f9}
p{color:#94a3b8;margin-bottom:16px}
code{background:#334155;padding:2px 6px;border-radius:4px;font-size:13px;font-family:monospace}
pre{background:#1e293b;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;margin-bottom:16px;border:1px solid #334155}
pre code{background:none;padding:0}
.step{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #334155}
.step-num{display:inline-block;background:#3b82f6;color:#fff;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:700;margin-right:8px}
a{color:#3b82f6;text-decoration:none}
</style>
</head><body>
<div class="container">
  <h1>Quickstart</h1>
  <p>Get up and running with the Trivela API in under 5 minutes.</p>

  <div class="step">
    <h2><span class="step-num">1</span> Get your API key</h2>
    <p>Request a sandbox key from the <a href="/dev-portal#sandbox">Developer Portal</a>.</p>
  </div>

  <div class="step">
    <h2><span class="step-num">2</span> Make your first request</h2>
    <pre><code>curl -H "Authorization: Bearer sandbox_your_key" \\
  https://api.trivela.example.com/api/v1/campaigns</code></pre>
  </div>

  <div class="step">
    <h2><span class="step-num">3</span> Create a campaign</h2>
    <pre><code>curl -X POST https://api.trivela.example.com/api/v1/campaigns \\
  -H "Authorization: Bearer sandbox_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My First Campaign",
    "description": "A test campaign",
    "rewardPerParticipant": 100,
    "maxParticipants": 100
  }'</code></pre>
  </div>

  <div class="step">
    <h2><span class="step-num">4</span> Set up webhooks</h2>
    <p>Register a webhook endpoint to receive real-time events.</p>
    <pre><code>curl -X POST https://api.trivela.example.com/api/v1/webhooks \\
  -H "Authorization: Bearer sandbox_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-app.com/webhooks/trivela",
    "events": ["campaign.created", "participant.registered"]
  }'</code></pre>
  </div>

  <div class="step">
    <h2><span class="step-num">5</span> Embed a widget</h2>
    <p>Add a campaign widget to your site.</p>
    <pre><code>&lt;iframe
  src="https://api.trivela.example.com/embed/v1/card/CAMPAIGN_ID?theme=dark"
  width="400" height="300"
  sandbox="allow-scripts allow-same-origin"
&gt;&lt;/iframe&gt;</code></pre>
  </div>

  <p style="margin-top:32px"><a href="/dev-portal">← Back to Developer Portal</a></p>
</div>
</body></html>`;
}
