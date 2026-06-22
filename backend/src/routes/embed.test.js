/**
 * Tests for the embed campaign route and partner attribution helpers.
 * Runs with Node.js built-in test runner:  node --test src/routes/embed.test.js
 */

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { createHmac } from 'node:crypto';
import { createEmbedRoute, verifyAttributionToken } from './embed.js';

// ── Fake campaign repository ──────────────────────────────────────────────────

const CAMPAIGNS = {
  active1: {
    id: 'active1',
    name: 'Active Campaign',
    description: 'Great campaign for testing',
    active: true,
    participantCount: 42,
    maxParticipants: 100,
    rewardPerAction: 10,
    endDate: null,
  },
  ended1: {
    id: 'ended1',
    name: 'Ended Campaign',
    description: null,
    active: false,
    participantCount: 5,
    maxParticipants: null,
    rewardPerAction: 0,
    endDate: '2020-01-01T00:00:00Z',
  },
};

function makeFakeRepo(campaigns = CAMPAIGNS) {
  return {
    getById(id) {
      return campaigns[id] ?? null;
    },
  };
}

// ── Lightweight fake req/res ─────────────────────────────────────────────────

function makeReq(params = {}, query = {}) {
  return {
    params,
    query,
    method: 'GET',
    path: `/embed/campaign/${params.id || 'unknown'}`,
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: '',
    status(code) {
      this._status = code;
      return this;
    },
    setHeader(name, value) {
      this._headers[name.toLowerCase()] = value;
    },
    send(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

const SITE_ORIGIN = 'https://trivela.app';
const TEST_SECRET = 'test-secret-do-not-use-in-prod';

describe('createEmbedRoute', () => {
  test('returns 404 HTML for unknown campaign', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'nonexistent' });
    const res = makeRes();

    handler(req, res);

    assert.equal(res._status, 404);
    assert.ok(res._body.includes('Campaign not found'));
  });

  test('renders campaign name in HTML', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.equal(res._status, 200);
    assert.ok(res._body.includes('Active Campaign'), 'campaign name should appear');
  });

  test('sets X-Embed-Route header', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.equal(res._headers['x-embed-route'], 'true');
  });

  test('sets X-Content-Type-Options: nosniff header', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.equal(res._headers['x-content-type-options'], 'nosniff');
  });

  test('includes register URL pointing to siteOrigin', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.ok(
      res._body.includes(`${SITE_ORIGIN}/campaign/active1`),
      'register link must point to site origin',
    );
  });

  test('threads valid partner ID into register URL and fires postMessage', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, { partner: 'my-partner' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes('ref=my-partner'), 'ref param should appear in register URL');
    assert.ok(res._body.includes('"my-partner"'), 'partner should appear in postMessage script');
  });

  test('includes attribution token when partner is set', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, { partner: 'acme' });
    const res = makeRes();

    handler(req, res);

    // at= param must be present in the HTML body (inside the register href)
    assert.ok(res._body.includes('at='), 'attribution token should be in register URL');
  });

  test('rejects invalid partner IDs (spaces, XSS attempts)', () => {
    // These must NOT result in ?ref=<value> appearing in the register URL.
    const invalidPartners = [
      '<script>alert(1)</script>',
      'partner id', // space
      'a'.repeat(65), // too long
      'partner/path', // slash
    ];

    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });

    for (const bad of invalidPartners) {
      const req = makeReq({ id: 'active1' }, { partner: bad });
      const res = makeRes();
      handler(req, res);

      // The exact bad value should never appear unescaped as a URL parameter.
      assert.ok(
        !res._body.includes(`ref=${encodeURIComponent(bad)}`),
        `bad partner "${bad}" must not appear as ref param`,
      );
      // No attribution token should be present for an invalid partner.
      assert.ok(
        !res._body.includes('&amp;at=') && !res._body.includes('?at='),
        `attribution token must not appear for bad partner "${bad}"`,
      );
    }
  });

  test('does not add ref param when partner is absent', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, {});
    const res = makeRes();

    handler(req, res);

    // Register URL must not contain ?ref= or ?at= when no partner given.
    const registerUrlMatch = res._body.match(/href="([^"]+campaign\/active1[^"]*)"/);
    assert.ok(registerUrlMatch, 'register link should be present');
    const href = registerUrlMatch[1];
    assert.ok(!href.includes('ref='), 'no ref param when partner is absent');
    assert.ok(!href.includes('at='), 'no attribution token when partner is absent');
  });

  test('accepts valid hex color and applies it to button', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, { color: '#ff0000' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes('#ff0000'), 'custom color should be applied');
  });

  test('rejects invalid hex colors', () => {
    const bad = ['red', '#GGGGGG', 'javascript:alert(1)', '#12345', ''];
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });

    for (const color of bad) {
      const req = makeReq({ id: 'active1' }, { color });
      const res = makeRes();
      handler(req, res);

      if (color) {
        assert.ok(
          !res._body.includes(`background: ${color}`),
          `invalid color "${color}" must not appear as background`,
        );
      }
    }
  });

  test('renders org name in powered-by footer', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, { org: 'MyDAO' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes('MyDAO'), 'org name should appear in powered-by footer');
  });

  test('HTML-escapes org name to prevent XSS', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, { org: '<script>bad()</script>' });
    const res = makeRes();

    handler(req, res);

    assert.ok(!res._body.includes('<script>bad()</script>'), 'raw script tag must not appear');
    assert.ok(res._body.includes('&lt;script&gt;'), 'org name should be HTML-escaped');
  });

  test('HTML-escapes campaign name to prevent XSS', () => {
    const evilRepo = makeFakeRepo({
      evil: {
        id: 'evil',
        name: '<img onerror="alert(1)" src=x>',
        description: 'safe',
        active: true,
        participantCount: 0,
        maxParticipants: null,
        rewardPerAction: 0,
        endDate: null,
      },
    });
    const handler = createEmbedRoute(evilRepo, SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'evil' });
    const res = makeRes();

    handler(req, res);

    assert.ok(!res._body.includes('<img onerror'), 'raw img tag must not appear');
    assert.ok(res._body.includes('&lt;img'), 'campaign name should be HTML-escaped');
  });

  test('shows "Ended" status for inactive campaign', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'ended1' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes('Ended'), 'status should be Ended');
  });

  test('shows dark theme styles by default', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes('#0f172a'), 'dark background should be present');
  });

  test('shows light theme when theme=light is set', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' }, { theme: 'light' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes('#f8fafc'), 'light background should be present');
  });

  test('postMessage script uses siteOrigin as target', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.ok(
      res._body.includes(JSON.stringify(SITE_ORIGIN)),
      'postMessage target must be siteOrigin',
    );
  });

  test('postMessage fires trivela:ready event', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.ok(res._body.includes("'trivela:ready'"), 'trivela:ready event must be fired');
  });

  test('postMessage fires trivela:register_click on CTA click', () => {
    const handler = createEmbedRoute(makeFakeRepo(), SITE_ORIGIN, { embedSecret: TEST_SECRET });
    const req = makeReq({ id: 'active1' });
    const res = makeRes();

    handler(req, res);

    assert.ok(
      res._body.includes("'trivela:register_click'"),
      'trivela:register_click event must be wired to CTA button',
    );
  });
});

describe('verifyAttributionToken', () => {
  test('returns true for a fresh token generated with the same secret', () => {
    const secret = 'my-secret';
    const campaign = 'c1';
    const partner = 'p1';
    const bucket = Math.floor(Date.now() / 300_000);
    const token = createHmac('sha256', secret)
      .update(`${campaign}:${partner}:${bucket}`)
      .digest('hex')
      .slice(0, 32);

    assert.equal(verifyAttributionToken(campaign, partner, token, secret), true);
  });

  test('returns false for a wrong secret', () => {
    const bucket = Math.floor(Date.now() / 300_000);
    const token = createHmac('sha256', 'right-secret')
      .update(`c1:p1:${bucket}`)
      .digest('hex')
      .slice(0, 32);

    assert.equal(verifyAttributionToken('c1', 'p1', token, 'wrong-secret'), false);
  });

  test('returns false for a tampered token', () => {
    assert.equal(
      verifyAttributionToken('c1', 'p1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'secret'),
      false,
    );
  });

  test('returns false for empty token or secret', () => {
    assert.equal(verifyAttributionToken('c1', 'p1', '', 'secret'), false);
    assert.equal(verifyAttributionToken('c1', 'p1', 'sometoken', ''), false);
  });
});
