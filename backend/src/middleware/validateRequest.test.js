import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateBody, validateQuery, validateParams } from './validateRequest.js';
import { campaignCreateSchema, pledgeSchema } from '../schemas.js';

describe('validateRequest Middleware (Issue #929)', () => {
  it('passes valid request body to next()', () => {
    const middleware = validateBody(campaignCreateSchema);
    const req = {
      body: {
        name: 'Test Campaign',
        rewardPerAction: 10,
      },
    };
    let nextCalled = false;
    const res = {};

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.body.name, 'Test Campaign');
  });

  it('returns uniform 400 error shape on invalid input', () => {
    const middleware = validateBody(campaignCreateSchema);
    const req = {
      body: {
        rewardPerAction: -5,
      },
    };

    let status = 0;
    let jsonBody = null;

    const res = {
      status(s) {
        status = s;
        return this;
      },
      json(b) {
        jsonBody = b;
        return this;
      },
    };

    middleware(req, res, () => {});

    assert.equal(status, 400);
    assert.equal(jsonBody.code, 'VALIDATION_ERROR');
    assert.equal(jsonBody.error, 'Validation failed');
    assert.ok(Array.isArray(jsonBody.details));
    assert.ok(jsonBody.details.some((d) => d.field === 'name'));
    assert.ok(jsonBody.details.some((d) => d.field === 'rewardPerAction'));
  });

  it('fuzz tests: rejects malicious injection strings, negative values, and wrong types', () => {
    const middleware = validateBody(pledgeSchema);

    const maliciousPayloads = [
      { campaignId: "1'; DROP TABLE campaigns; --", amount: -100 },
      { campaignId: 1, amount: 'not-a-number' },
      { campaignId: 1, amount: NaN },
      { campaignId: 1, amount: Infinity },
      { campaignId: '', amount: 10 },
      { amount: 10 },
    ];

    for (const payload of maliciousPayloads) {
      let status = 0;
      let jsonBody = null;

      const req = { body: payload };
      const res = {
        status(s) {
          status = s;
          return this;
        },
        json(b) {
          jsonBody = b;
          return this;
        },
      };

      middleware(req, res, () => {});

      assert.equal(status, 400, `Payload ${JSON.stringify(payload)} should produce 400`);
      assert.equal(jsonBody.code, 'VALIDATION_ERROR');
    }
  });
});
